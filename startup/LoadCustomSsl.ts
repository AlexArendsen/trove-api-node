import fs from 'fs'

type CustomSslCredentials = {
    defined: boolean
    cert: string
    key: string
}

export const LoadCustomSsl = (): CustomSslCredentials => {

    const sslCertPath = process.env['SSL_CERT_FILE']
    const sslKeyPath = process.env['SSL_KEY_FILE']
    const useCustomHttps = !!(sslCertPath && sslKeyPath)
    let cert = ""
    let key = ""
    if (useCustomHttps) {
        cert = fs.readFileSync(sslCertPath, 'utf8')
        key = fs.readFileSync(sslKeyPath, 'utf8')
    }

    return { defined: useCustomHttps, cert, key }

}