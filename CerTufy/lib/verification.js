// lib/verification.js

// ============================================
// Verification Manager Class
// ============================================
class VerificationManager {
    constructor() {
        this.verificationCache = new Map();
        this.cacheTimeout = 300000; // 5 minutes
        this.maxVerificationAttempts = 5;
        this.rateLimitWindow = 60000; // 1 minute
        this.attempts = new Map();
    }

    // Verify a certificate code
    async verifyCertificate(code, db) {
        try {
            // Validate code format
            const validation = this.validateCode(code);
            if (!validation.valid) {
                return {
                    valid: false,
                    message: validation.message,
                    error: validation.error
                };
            }

            // Check rate limit
            const rateLimitCheck = this.checkRateLimit(code);
            if (!rateLimitCheck.allowed) {
                return {
                    valid: false,
                    message: `Too many verification attempts. Please wait ${Math.ceil(rateLimitCheck.waitTime / 1000)} seconds.`,
                    error: 'rate_limit'
                };
            }

            // Check cache first
            const cachedResult = this.getFromCache(code);
            if (cachedResult) {
                return cachedResult;
            }

            // Query database
            const certificate = await this.findCertificate(code, db);
            
            if (!certificate) {
                this.addToCache(code, {
                    valid: false,
                    message: 'Certificate not found. Please check the code and try again.',
                    error: 'not_found'
                });
                return {
                    valid: false,
                    message: 'Certificate not found. Please check the code and try again.',
                    error: 'not_found'
                };
            }

            // Check if certificate is expired
            if (this.isExpired(certificate)) {
                this.addToCache(code, {
                    valid: false,
                    message: 'This certificate has expired.',
                    error: 'expired'
                });
                return {
                    valid: false,
                    message: 'This certificate has expired.',
                    error: 'expired'
                };
            }

            // Update verification count
            await this.updateVerificationCount(certificate, db);

            // Prepare result
            const result = {
                valid: true,
                certificate: {
                    userName: certificate.userName,
                    userEmail: certificate.userEmail,
                    videoTitle: certificate.videoTitle,
                    playlistTitle: certificate.playlistTitle || '',
                    verificationCode: certificate.verificationCode,
                    generatedDate: certificate.generatedDate,
                    verificationCount: (certificate.verificationCount || 0) + 1
                }
            };

            // Cache result
            this.addToCache(code, result);

            return result;

        } catch (error) {
            console.error('Verification error:', error);
            return {
                valid: false,
                message: 'An error occurred during verification. Please try again.',
                error: 'system_error'
            };
        }
    }

    // Validate verification code format
    validateCode(code) {
        if (!code) {
            return {
                valid: false,
                message: 'Please enter a verification code.',
                error: 'empty'
            };
        }

        const trimmedCode = code.trim().toUpperCase();

        if (trimmedCode.length !== 12) {
            return {
                valid: false,
                message: 'Verification code must be exactly 12 characters.',
                error: 'invalid_length'
            };
        }

        if (!/^[A-Z0-9]+$/.test(trimmedCode)) {
            return {
                valid: false,
                message: 'Verification code must contain only letters and numbers.',
                error: 'invalid_characters'
            };
        }

        return {
            valid: true,
            code: trimmedCode,
            message: 'Valid code format'
        };
    }

    // Find certificate in database
    async findCertificate(code, db) {
        try {
            // Try to find by verification code
            const certificates = await db.getByIndex('certificates', 'verificationCode', code);
            
            if (certificates && certificates.length > 0) {
                return certificates[0];
            }

            // Try to find by unique key (legacy support)
            const allCerts = await db.getAll('certificates');
            for (const cert of allCerts) {
                if (cert.verificationCode === code) {
                    return cert;
                }
            }

            return null;

        } catch (error) {
            console.error('Error finding certificate:', error);
            return null;
        }
    }

    // Check if certificate is expired
    isExpired(certificate) {
        if (!certificate.expiryDate) return false;
        
        const expiryDate = new Date(certificate.expiryDate);
        const now = new Date();
        
        return now > expiryDate;
    }

    // Update verification count
    async updateVerificationCount(certificate, db) {
        try {
            certificate.verificationCount = (certificate.verificationCount || 0) + 1;
            certificate.lastVerified = new Date().toISOString();
            certificate.verified = true;
            
            await db.update('certificates', certificate);
            
            // Add analytics event
            await db.add('analytics', {
                type: 'certificate_verified',
                timestamp: Date.now(),
                data: {
                    certificateId: certificate.id,
                    verificationCode: certificate.verificationCode,
                    videoId: certificate.videoId,
                    verificationCount: certificate.verificationCount
                },
                userId: certificate.userEmail || 'anonymous'
            });
            
        } catch (error) {
            console.error('Error updating verification count:', error);
            // Don't throw - this is non-critical
        }
    }

    // Rate limiting
    checkRateLimit(code) {
        const now = Date.now();
        const key = code.toLowerCase();
        
        if (!this.attempts.has(key)) {
            this.attempts.set(key, {
                count: 1,
                firstAttempt: now,
                lastAttempt: now
            });
            return { allowed: true };
        }

        const data = this.attempts.get(key);
        
        // Reset if window has passed
        if (now - data.firstAttempt > this.rateLimitWindow) {
            this.attempts.set(key, {
                count: 1,
                firstAttempt: now,
                lastAttempt: now
            });
            return { allowed: true };
        }

        // Check if max attempts reached
        if (data.count >= this.maxVerificationAttempts) {
            const waitTime = this.rateLimitWindow - (now - data.firstAttempt);
            return { 
                allowed: false, 
                waitTime: Math.max(0, waitTime)
            };
        }

        // Increment attempts
        data.count++;
        data.lastAttempt = now;
        this.attempts.set(key, data);
        
        return { allowed: true };
    }

    // Cache management
    getFromCache(code) {
        const key = code.toLowerCase();
        if (this.verificationCache.has(key)) {
            const entry = this.verificationCache.get(key);
            if (Date.now() - entry.timestamp < this.cacheTimeout) {
                return entry.result;
            } else {
                this.verificationCache.delete(key);
            }
        }
        return null;
    }

    addToCache(code, result) {
        const key = code.toLowerCase();
        this.verificationCache.set(key, {
            result: result,
            timestamp: Date.now()
        });
        
        // Clean old cache entries
        this.cleanCache();
    }

    cleanCache() {
        const now = Date.now();
        for (const [key, entry] of this.verificationCache) {
            if (now - entry.timestamp > this.cacheTimeout) {
                this.verificationCache.delete(key);
            }
        }
    }

    // Clear cache
    clearCache() {
        this.verificationCache.clear();
    }

    // Reset rate limiting for a code
    resetRateLimit(code) {
        const key = code.toLowerCase();
        this.attempts.delete(key);
    }

    // Get verification stats
    async getVerificationStats(certificate, db) {
        try {
            const cert = await db.get('certificates', certificate.id);
            if (!cert) {
                return {
                    totalVerifications: 0,
                    firstVerified: null,
                    lastVerified: null
                };
            }

            return {
                totalVerifications: cert.verificationCount || 0,
                firstVerified: cert.firstVerified || null,
                lastVerified: cert.lastVerified || null
            };
        } catch (error) {
            console.error('Error getting verification stats:', error);
            return {
                totalVerifications: 0,
                firstVerified: null,
                lastVerified: null
            };
        }
    }

    // Generate verification URL
    generateVerificationUrl(code) {
        const baseUrl = chrome.runtime.getURL('verify/verify.html');
        return `${baseUrl}?code=${code}`;
    }

    // Verify multiple codes
    async verifyMultipleCodes(codes, db) {
        const results = [];
        for (const code of codes) {
            const result = await this.verifyCertificate(code, db);
            results.push({
                code,
                ...result
            });
        }
        return results;
    }

    // Check if certificate is valid
    isValidCertificate(certificate) {
        if (!certificate) return false;
        
        // Check required fields
        const requiredFields = ['verificationCode', 'userName', 'videoTitle', 'generatedDate'];
        for (const field of requiredFields) {
            if (!certificate[field]) {
                return false;
            }
        }
        
        // Check if expired
        if (this.isExpired(certificate)) {
            return false;
        }
        
        return true;
    }

    // Format verification result for display
    formatVerificationResult(result) {
        if (!result) {
            return {
                status: 'error',
                message: 'No verification result available'
            };
        }

        if (result.valid) {
            return {
                status: 'success',
                message: 'Certificate Verified Successfully!',
                certificate: {
                    name: result.certificate.userName,
                    video: result.certificate.videoTitle,
                    course: result.certificate.playlistTitle,
                    date: result.certificate.generatedDate,
                    code: result.certificate.verificationCode
                }
            };
        } else {
            return {
                status: 'error',
                message: result.message || 'Verification Failed',
                error: result.error
            };
        }
    }
}

// ============================================
// Verification Helper Functions
// ============================================
export function formatVerificationCode(code) {
    if (!code) return '';
    const trimmed = code.trim().toUpperCase();
    // Format as groups of 4
    return trimmed.replace(/(.{4})/g, '$1 ').trim();
}

export function normalizeVerificationCode(code) {
    if (!code) return '';
    return code.trim().toUpperCase().replace(/\s/g, '');
}

export function generateVerificationCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 12; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

export function isValidVerificationCode(code) {
    if (!code) return false;
    const normalized = normalizeVerificationCode(code);
    return normalized.length === 12 && /^[A-Z0-9]+$/.test(normalized);
}

export function getVerificationStatusText(certificate) {
    if (!certificate) return 'Invalid Certificate';
    
    const isExpired = new Date(certificate.expiryDate) < new Date();
    if (isExpired) return 'Expired';
    
    if (certificate.verified) return 'Verified';
    return 'Active';
}

export function getVerificationStatusColor(certificate) {
    if (!certificate) return '#f44336';
    
    const isExpired = new Date(certificate.expiryDate) < new Date();
    if (isExpired) return '#f44336';
    
    if (certificate.verified) return '#4CAF50';
    return '#FF9800';
}

// ============================================
// Singleton Instance
// ============================================
let verificationInstance = null;

export function getVerificationManager() {
    if (!verificationInstance) {
        verificationInstance = new VerificationManager();
    }
    return verificationInstance;
}

// ============================================
// Export
// ============================================
export default {
    getVerificationManager,
    formatVerificationCode,
    normalizeVerificationCode,
    generateVerificationCode,
    isValidVerificationCode,
    getVerificationStatusText,
    getVerificationStatusColor
};