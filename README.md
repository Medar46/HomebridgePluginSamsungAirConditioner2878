# Homebridge-plugin-samsung-air-conditioner2878

Homebridge plugin for controlling Samsung Air Conditioner working on port 2878. Allows to control AC with HomeKit and Siri.  
If you have a Samsung AC that operates on port 8888, check this plugin instead: [homebridge-samsung-airconditioner](https://github.com/cicciovo/homebridge-samsung-airconditioner)

## Installation
1. Install [Homebridge](https://github.com/nfarina/homebridge).
2. Install this plugin by running `npm install -g homebridge-plugin-samsung-air-conditioner2878`.
3. Assign a static IP address to your AC (check your router settings to do that).
4. Run `homebridge-samsung-ac-get-token <your ac's ip address>` in the terminal and follow instructions. If you get any SSL/certificate errors, try `homebridge-samsung-ac-get-token <your ac's ip address> --skipCertificate`.
5. Update your Homebridge `config.json`. Check `config-sample.json` for reference. 
    - Required parameters:
        - `accessory` - always "Samsung Air Conditioner"
        - `name` - Name of your device
        - `ip_address` - IP address of air conditioner
        - `mac` - MAC address of air conditioner in the format `AA:BB:CC:DD:EE:FF` or `AA-BB-CC-DD-EE-FF`
        - `token` - token returned by `homebridge-samsung-ac-get-token <your ac's ip address>`
    - Optional parameters:
        - `skip_certificate` - `true`/`false` (default `false`). If `true` then skips passing certificate to the underlying connection which might mitigate SSL errors on some AC units. Try it if you get any SSL/certificate errors.
        - `log_socket_activity` - `true`/`false` (default `false`). If `true` then logs additional raw data to the console.
        - `keep_alive` - dictionary with keep alive settings:
            - `enabled` - `true`/`false` (default `true`). If `true` then enables keep alive on the underlying socket.
            - `initial_delay` - milliseconds as an integer (default `10000`). Time which needs to pass after the last write to the socket before sending the first keep-alive packet.
            - `interval` - milliseconds as an integer (default `10000`). Time between keep-alive packets.
            - `probes` - integer (default `10`). Number of keep-alive packets to fail before treating the connection as closed.
         - `debug` - `true`/`false` (default `false`). If `true`, enables detailed logging for debugging purposes.

## Features
- Turning AC on and off
- Getting and setting target temperature
- Getting current temperature
- Getting and setting mode
- Getting and setting swing mode
- Getting and setting wind level
- Reacting to changes made using the AC's remote

## Confirmed compatibility list (model numbers)
- AR12HSSFAWKNEU
- AR18HSFSAWKNEU
- AR12HSFSAWKN
- AR24FSSSBWKN
- AR12FSSEDWUNEU
- AR09HSSDBWKN
- AR09HSSFRWKNER
- MLM-H02

If your device's number is not on the list but you have tested it and it works, please make a PR with your device's number.

## Acknowledgment
This project is heavily based on 95% of the work of Sebastian Osinski - [HomebridgePluginSamsungAirConditioner](https://github.com/SebastianOsinski/HomebridgePluginSamsungAirConditioner).

## Report an Issue

If you encounter any issues or bugs while using this plugin, please feel free to **[report an issue](https://github.com/Medar46/HomebridgePluginSamsungAirConditioner2878/issues)** on GitHub.

Before creating a new issue, please check the **[existing issues](https://github.com/Medar46/HomebridgePluginSamsungAirConditioner2878/issues)** to see if your problem has already been reported or resolved.
