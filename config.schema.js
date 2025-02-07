{
    "pluginAlias": "Samsung Air Conditioner",
    "pluginType": "platform",
    "singular": true,
    "schema": {
        "type": "object",
        "properties": {
            "accessories": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "accessory": {
                            "type": "string",
                            "title": "Samsung Air Conditioner",
                            "default": "Samsung Air Conditioner"
                        },
                        "name": {
                            "type": "string",
                            "title": "Samsung Air Conditioner",
                            "default": "Samsung Air Conditioner"
                        },
                        "ip_address": {
                            "type": "string",
                            "title": "IP Address"
                        },
                        "mac": {
                            "type": "string",
                            "title": "MAC Address"
                        },
                        "token": {
                            "type": "string",
                            "title": "Token"
                        },
                        "skip_certificate": {
                            "type": "boolean",
                            "title": "Skip Certificate",
                            "default": false
                        }
                    },
                    "required": ["accessory", "name", "ip_address", "mac", "token", "skip_certificate"]
                }
            }
        },
        "required": ["accessories"]
    }
};
