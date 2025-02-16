const fs = require('fs');
const path = require('path');

module.exports.createConnectionOptions = function(ipAddress, skipCertificate, log) {
    const pfxPath = path.join(__dirname, '../res/cert.pfx');

    let options = { 
        port: 2878, 
        host: ipAddress, 
        rejectUnauthorized: false,
        secureProtocol: 'TLSv1_method',
        ciphers: skipCertificate ? 'HIGH:!DH:!aNULL' : 'ALL:@SECLEVEL=0'
    };

    if (!skipCertificate) {
        try {
            options.pfx = fs.readFileSync(pfxPath);
            log(`✅ [INFO] Loaded SSL certificate.`);
        } catch (error) {
            log(`⚠️ [WARN] Failed to read SSL certificate. Skipping validation.`);
        }
    }

    log(`🔧 [INFO] Connection configuration:`, options);
    return options;
};
