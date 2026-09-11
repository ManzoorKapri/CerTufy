// lib/certificate-generator.js

// ============================================
// Certificate Template Definitions
// ============================================
const TEMPLATES = {
    'Classic': {
        id: 'classic',
        name: 'Classic',
        description: 'Double border with gold seal',
        styles: [
            'background: #fefcf5;',
            'border: 8px double #cc0000;',
            'padding: 35px 40px;',
            'position: relative;',
            'font-family: "Playfair Display", "Georgia", serif;'
        ],
        seal: true,
        gradient: false
    },
    'Modern': {
        id: 'modern',
        name: 'Modern',
        description: 'Gradient background with modern typography',
        styles: [
            'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);',
            'color: #ffffff;',
            'border: none;',
            'padding: 40px 50px;',
            'position: relative;',
            'overflow: hidden;',
            'font-family: "Playfair Display", "Georgia", serif;'
        ],
        seal: false,
        gradient: true
    },
    'Elegant': {
        id: 'elegant',
        name: 'Elegant',
        description: 'Dark theme with gold accents',
        styles: [
            'background: #1a1a2e;',
            'color: #e8d5a3;',
            'border: 3px solid #c9a84c;',
            'padding: 35px 40px;',
            'position: relative;',
            'font-family: "Playfair Display", "Georgia", serif;'
        ],
        seal: false,
        gradient: false
    },
    'Minimal': {
        id: 'minimal',
        name: 'Minimal',
        description: 'Clean whitespace design',
        styles: [
            'background: #ffffff;',
            'border: 2px solid #e0e0e0;',
            'padding: 50px 60px;',
            'box-shadow: none;',
            'font-family: "Inter", "Segoe UI", sans-serif;'
        ],
        seal: false,
        gradient: false
    },
    'Creative': {
        id: 'creative',
        name: 'Creative',
        description: 'Video thumbnail overlay style',
        styles: [
            'background: #1a1a1a;',
            'color: #ffffff;',
            'padding: 0;',
            'overflow: hidden;',
            'aspect-ratio: 1.414 / 1;',
            'font-family: "Playfair Display", "Georgia", serif;'
        ],
        seal: false,
        gradient: false,
        overlay: true
    }
};

// ============================================
// Certificate Generator Class
// ============================================
class CertificateGenerator {
    constructor() {
        this.templates = TEMPLATES;
    }

    // Generate full certificate HTML
    generateCertificateHTML(data) {
        const template = this.templates[data.template] || this.templates['Classic'];
        const templateClass = template.id;
        
        // Build certificate HTML
        let html = `<div class="certufy-certificate ${templateClass}" id="certificate-display">`;
        
        // Add creative overlay if applicable
        if (template.overlay) {
            html += `
                <div class="certufy-creative-bg">▶</div>
                <div class="certufy-creative-content">
            `;
        }
        
        // Add seal for classic template
        if (template.seal) {
            html += `
                <div class="certufy-cert-seal">
                    <span class="certufy-cert-seal-text">★<br>SEAL</span>
                </div>
            `;
        }
        
        // Add corner decorations for elegant template
        if (template.id === 'elegant') {
            html += `
                <div class="certufy-cert-corner certufy-cert-corner-tl"></div>
                <div class="certufy-cert-corner certufy-cert-corner-tr"></div>
                <div class="certufy-cert-corner certufy-cert-corner-bl"></div>
                <div class="certufy-cert-corner certufy-cert-corner-br"></div>
            `;
        }
        
        // Add icon for modern template
        if (template.id === 'modern') {
            html += `<div class="certufy-cert-icon">🎓</div>`;
        }
        
        // Certificate content
        html += `
            <div class="certufy-cert-title">CERTIFICATE OF COMPLETION</div>
            <div class="certufy-cert-subtitle">This certifies that</div>
            <div class="certufy-cert-name">${this.escapeHTML(data.userName)}</div>
            <div class="certufy-cert-divider"></div>
            <div class="certufy-cert-details">
                Has successfully completed the ${data.playlistTitle ? 'course' : 'video'}<br>
                <strong>${this.escapeHTML(data.videoTitle)}</strong>
                ${data.playlistTitle ? `<br><span style="font-size: 13px; color: ${template.id === 'elegant' ? '#c9a84c' : template.id === 'modern' ? 'rgba(255,255,255,0.7)' : '#888'};">Course: ${this.escapeHTML(data.playlistTitle)}</span>` : ''}
            </div>
            <div class="certufy-cert-details" style="margin-top: 8px;">
                Date: ${data.generatedDate}
            </div>
            <div class="certufy-cert-code">
                Verification Code: ${data.verificationCode}
            </div>
            <div class="certufy-cert-footer-text">
                ● CerTufy — Verifiable Certificates for YouTube Learning ●
            </div>
        `;
        
        // Close creative overlay
        if (template.overlay) {
            html += `</div>`;
        }
        
        // Add decoration for classic template
        if (template.id === 'classic') {
            html += `<div class="certufy-cert-decoration">✦ ✦ ✦ ✦ ✦</div>`;
        }
        
        html += `</div>`;
        
        return html;
    }

    // Generate complete HTML page for download
    generateFullPageHTML(data) {
        const certificateHTML = this.generateCertificateHTML(data);
        const styles = this.getCertificateStyles(data.template);
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Certificate - ${this.escapeHTML(data.userName)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Inter:wght@300;400;500;600;700&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <style>
        /* Reset */
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: #f5f5f5;
            margin: 0;
            padding: 20px;
            font-family: 'Inter', sans-serif;
        }
        
        /* Certificate Styles */
        ${styles}
        
        /* Print Styles */
        @media print {
            body {
                background: #ffffff;
                padding: 0;
            }
            .certufy-certificate {
                box-shadow: none !important;
                page-break-inside: avoid;
                border-radius: 0;
            }
            .certufy-certificate.classic .certufy-cert-seal {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .certufy-certificate.modern {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .certufy-certificate.elegant {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .certufy-certificate.creative {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .certufy-certificate.creative .certufy-creative-bg {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
        
        /* Responsive */
        @media (max-width: 768px) {
            .certufy-certificate {
                padding: 20px 24px !important;
                min-height: 400px;
            }
            .certufy-cert-title { font-size: 20px !important; }
            .certufy-cert-name { font-size: 24px !important; }
        }
    </style>
</head>
<body>
    ${certificateHTML}
</body>
</html>
        `;
    }

    // Get certificate styles for a specific template
    getCertificateStyles(templateName) {
        const template = this.templates[templateName] || this.templates['Classic'];
        const templateClass = template.id;
        
        return `
            .certufy-certificate {
                width: 100%;
                max-width: 800px;
                aspect-ratio: 1.414 / 1;
                background: #ffffff;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                text-align: center;
                font-family: 'Playfair Display', 'Georgia', serif;
                position: relative;
            }
            
            /* Template-specific styles */
            .certufy-certificate.${templateClass} {
                ${template.styles.join('\n                ')}
            }
            
            /* Classic template */
            .certufy-certificate.classic::before {
                content: '';
                position: absolute;
                top: 12px;
                left: 12px;
                right: 12px;
                bottom: 12px;
                border: 2px solid #cc0000;
                pointer-events: none;
            }
            
            .certufy-certificate.classic .certufy-cert-seal {
                position: absolute;
                top: 30px;
                right: 30px;
                width: 80px;
                height: 80px;
                background: radial-gradient(circle at 30% 30%, #ffd700, #d4a017);
                border-radius: 50%;
                border: 5px solid #b8860b;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 0 30px rgba(184, 134, 11, 0.3);
            }
            
            .certufy-certificate.classic .certufy-cert-seal-text {
                font-size: 11px;
                font-weight: 900;
                color: #8B6914;
                text-transform: uppercase;
                text-align: center;
                line-height: 1.3;
                letter-spacing: 1px;
            }
            
            .certufy-certificate.classic .certufy-cert-decoration {
                position: absolute;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                font-size: 14px;
                color: #cc0000;
                opacity: 0.3;
                letter-spacing: 8px;
            }
            
            /* Modern template */
            .certufy-certificate.modern::before {
                content: '';
                position: absolute;
                top: -50%;
                right: -50%;
                width: 100%;
                height: 100%;
                background: radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%);
                pointer-events: none;
            }
            
            .certufy-certificate.modern::after {
                content: '✦';
                position: absolute;
                bottom: 20px;
                right: 30px;
                font-size: 60px;
                opacity: 0.1;
                color: #ffffff;
            }
            
            .certufy-certificate.modern .certufy-cert-icon {
                position: absolute;
                top: 20px;
                left: 30px;
                font-size: 40px;
                opacity: 0.15;
            }
            
            /* Elegant template */
            .certufy-certificate.elegant::before {
                content: '';
                position: absolute;
                top: 10px;
                left: 10px;
                right: 10px;
                bottom: 10px;
                border: 1px solid rgba(201, 168, 76, 0.3);
                pointer-events: none;
            }
            
            .certufy-certificate.elegant::after {
                content: '✦ ✦ ✦';
                position: absolute;
                bottom: 30px;
                left: 50%;
                transform: translateX(-50%);
                font-size: 16px;
                color: #c9a84c;
                opacity: 0.3;
                letter-spacing: 12px;
            }
            
            .certufy-certificate.elegant .certufy-cert-corner {
                position: absolute;
                width: 30px;
                height: 30px;
                border-color: #c9a84c;
                border-style: solid;
                border-width: 0;
                opacity: 0.3;
            }
            .certufy-certificate.elegant .certufy-cert-corner-tl {
                top: 15px; left: 15px;
                border-top-width: 2px; border-left-width: 2px;
            }
            .certufy-certificate.elegant .certufy-cert-corner-tr {
                top: 15px; right: 15px;
                border-top-width: 2px; border-right-width: 2px;
            }
            .certufy-certificate.elegant .certufy-cert-corner-bl {
                bottom: 15px; left: 15px;
                border-bottom-width: 2px; border-left-width: 2px;
            }
            .certufy-certificate.elegant .certufy-cert-corner-br {
                bottom: 15px; right: 15px;
                border-bottom-width: 2px; border-right-width: 2px;
            }
            
            /* Creative template */
            .certufy-certificate.creative .certufy-creative-bg {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(135deg, rgba(204, 0, 0, 0.8), rgba(0, 0, 0, 0.9));
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 120px;
                opacity: 0.2;
            }
            
            .certufy-certificate.creative .certufy-creative-content {
                position: relative;
                z-index: 1;
                padding: 40px;
            }
            
            /* Common elements */
            .certufy-cert-title {
                font-size: 28px;
                font-weight: 700;
                color: #333333;
                margin-bottom: 8px;
                letter-spacing: 2px;
            }
            
            .certufy-cert-subtitle {
                font-size: 16px;
                color: #666666;
                margin-bottom: 20px;
                font-family: 'Inter', sans-serif;
                font-weight: 300;
                letter-spacing: 3px;
                text-transform: uppercase;
            }
            
            .certufy-cert-name {
                font-size: 34px;
                font-weight: 700;
                color: #cc0000;
                margin: 16px 0;
                font-family: 'Playfair Display', serif;
            }
            
            .certufy-cert-divider {
                width: 80px;
                height: 2px;
                background: #cc0000;
                margin: 12px auto;
            }
            
            .certufy-cert-details {
                font-size: 14px;
                color: #666666;
                font-family: 'Inter', sans-serif;
                line-height: 1.8;
                margin: 8px 0;
            }
            
            .certufy-cert-details strong {
                color: #333333;
            }
            
            .certufy-cert-code {
                font-family: 'Courier New', monospace;
                font-size: 13px;
                color: #999999;
                background: #f5f5f5;
                padding: 4px 12px;
                border-radius: 4px;
                letter-spacing: 1px;
                margin-top: 8px;
                display: inline-block;
            }
            
            .certufy-cert-footer-text {
                font-size: 11px;
                color: #999999;
                font-family: 'Inter', sans-serif;
                margin-top: 16px;
                letter-spacing: 0.5px;
            }
            
            /* Modern template overrides */
            .certufy-certificate.modern .certufy-cert-title,
            .certufy-certificate.modern .certufy-cert-subtitle,
            .certufy-certificate.modern .certufy-cert-name,
            .certufy-certificate.modern .certufy-cert-details,
            .certufy-certificate.modern .certufy-cert-details strong,
            .certufy-certificate.modern .certufy-cert-footer-text {
                color: #ffffff;
            }
            
            .certufy-certificate.modern .certufy-cert-code {
                color: rgba(255,255,255,0.8);
                background: rgba(255,255,255,0.15);
                border: 1px solid rgba(255,255,255,0.2);
            }
            
            /* Elegant template overrides */
            .certufy-certificate.elegant .certufy-cert-title {
                color: #c9a84c;
            }
            .certufy-certificate.elegant .certufy-cert-subtitle {
                color: #c9a84c;
            }
            .certufy-certificate.elegant .certufy-cert-name {
                color: #e8d5a3;
            }
            .certufy-certificate.elegant .certufy-cert-details {
                color: #c9a84c;
            }
            .certufy-certificate.elegant .certufy-cert-details strong {
                color: #e8d5a3;
            }
            .certufy-certificate.elegant .certufy-cert-footer-text {
                color: rgba(201, 168, 76, 0.5);
            }
            .certufy-certificate.elegant .certufy-cert-code {
                color: #c9a84c;
                background: rgba(201, 168, 76, 0.1);
                border: 1px solid rgba(201, 168, 76, 0.2);
            }
            
            /* Minimal template overrides */
            .certufy-certificate.minimal .certufy-cert-title {
                font-size: 32px;
                font-weight: 400;
                letter-spacing: 4px;
                color: #333333;
            }
            .certufy-certificate.minimal .certufy-cert-name {
                font-size: 36px;
                font-weight: 300;
                color: #333333;
            }
            .certufy-certificate.minimal .certufy-cert-subtitle {
                color: #999999;
                font-size: 14px;
                font-weight: 300;
            }
            
            /* Creative template overrides */
            .certufy-certificate.creative .certufy-cert-title {
                color: #ffffff;
            }
            .certufy-certificate.creative .certufy-cert-name {
                color: #ff4444;
            }
            .certufy-certificate.creative .certufy-cert-subtitle {
                color: rgba(255,255,255,0.9);
            }
            .certufy-certificate.creative .certufy-cert-details {
                color: rgba(255,255,255,0.85);
            }
            .certufy-certificate.creative .certufy-cert-details strong {
                color: #ffffff;
            }
            .certufy-certificate.creative .certufy-cert-footer-text {
                color: rgba(255,255,255,0.6);
            }
            .certufy-certificate.creative .certufy-cert-code {
                color: rgba(255,255,255,0.8);
                background: rgba(255,255,255,0.15);
                border: 1px solid rgba(255,255,255,0.2);
            }
        `;
    }

    // Get template preview HTML
    getTemplatePreview(templateName) {
        const template = this.templates[templateName] || this.templates['Classic'];
        const styles = template.styles.join(' ');
        
        const previews = {
            'Classic': `
                <div style="padding: 20px; border: 3px double #cc0000; border-radius: 4px; text-align: center; background: #fefcf5; width: 100%;">
                    <div style="font-size: 16px; font-weight: 700; color: #333;">CERTIFICATE OF COMPLETION</div>
                    <div style="width: 40px; height: 2px; background: #cc0000; margin: 8px auto;"></div>
                    <div style="font-size: 13px; color: #666;">Presented to</div>
                    <div style="font-size: 18px; font-weight: 700; color: #cc0000; margin: 4px 0;">[Your Name]</div>
                    <div style="font-size: 11px; color: #888;">✦ Double border with gold seal ✦</div>
                </div>
            `,
            'Modern': `
                <div style="padding: 20px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 4px; text-align: center; color: white; width: 100%;">
                    <div style="font-size: 16px; font-weight: 700;">CERTIFICATE OF COMPLETION</div>
                    <div style="width: 40px; height: 2px; background: rgba(255,255,255,0.5); margin: 8px auto;"></div>
                    <div style="font-size: 13px; opacity: 0.9;">Presented to</div>
                    <div style="font-size: 18px; font-weight: 700; margin: 4px 0;">[Your Name]</div>
                    <div style="font-size: 11px; opacity: 0.8;">✦ Modern gradient design ✦</div>
                </div>
            `,
            'Elegant': `
                <div style="padding: 20px; background: #1a1a2e; border: 2px solid #c9a84c; border-radius: 4px; text-align: center; color: #e8d5a3; width: 100%;">
                    <div style="font-size: 16px; font-weight: 700; color: #c9a84c;">CERTIFICATE OF COMPLETION</div>
                    <div style="width: 40px; height: 2px; background: #c9a84c; margin: 8px auto;"></div>
                    <div style="font-size: 13px; color: #c9a84c;">Presented to</div>
                    <div style="font-size: 18px; font-weight: 700; color: #e8d5a3; margin: 4px 0;">[Your Name]</div>
                    <div style="font-size: 11px; color: #c9a84c;">✦ Dark theme with gold accents ✦</div>
                </div>
            `,
            'Minimal': `
                <div style="padding: 20px; border: 2px solid #e0e0e0; border-radius: 4px; text-align: center; background: white; width: 100%;">
                    <div style="font-size: 16px; font-weight: 300; color: #333; letter-spacing: 2px;">CERTIFICATE OF COMPLETION</div>
                    <div style="width: 40px; height: 2px; background: #cc0000; margin: 8px auto;"></div>
                    <div style="font-size: 13px; color: #999;">Presented to</div>
                    <div style="font-size: 18px; font-weight: 300; color: #333; margin: 4px 0;">[Your Name]</div>
                    <div style="font-size: 11px; color: #999;">✦ Clean minimal design ✦</div>
                </div>
            `,
            'Creative': `
                <div style="padding: 20px; background: linear-gradient(135deg, rgba(204,0,0,0.8), rgba(0,0,0,0.9)); border-radius: 4px; text-align: center; color: white; width: 100%; position: relative; overflow: hidden;">
                    <div style="font-size: 40px; opacity: 0.2; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">▶</div>
                    <div style="position: relative; z-index: 1;">
                        <div style="font-size: 16px; font-weight: 700;">CERTIFICATE OF COMPLETION</div>
                        <div style="width: 40px; height: 2px; background: rgba(255,255,255,0.5); margin: 8px auto;"></div>
                        <div style="font-size: 13px; opacity: 0.9;">Presented to</div>
                        <div style="font-size: 18px; font-weight: 700; color: #ff4444; margin: 4px 0;">[Your Name]</div>
                        <div style="font-size: 11px; opacity: 0.8;">✦ Video thumbnail overlay ✦</div>
                    </div>
                </div>
            `
        };
        
        return previews[templateName] || previews['Classic'];
    }

    // Get all templates
    getTemplates() {
        return Object.values(this.templates);
    }

    // Get template by ID
    getTemplate(id) {
        return this.templates[id] || this.templates['Classic'];
    }

    // Escape HTML
    escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Validate certificate data
    validateData(data) {
        const errors = [];
        
        if (!data.userName || data.userName.trim().length === 0) {
            errors.push('Name is required');
        }
        
        if (!data.userEmail || !data.userEmail.includes('@')) {
            errors.push('Valid email is required');
        }
        
        if (!data.videoTitle) {
            errors.push('Video title is required');
        }
        
        if (!data.verificationCode) {
            errors.push('Verification code is required');
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }

    // Get default template
    getDefaultTemplate() {
        return 'Classic';
    }
}

// ============================================
// Singleton Instance
// ============================================
let generatorInstance = null;

export function getCertificateGenerator() {
    if (!generatorInstance) {
        generatorInstance = new CertificateGenerator();
    }
    return generatorInstance;
}

// ============================================
// Export
// ============================================
export default {
    getCertificateGenerator,
    TEMPLATES
};