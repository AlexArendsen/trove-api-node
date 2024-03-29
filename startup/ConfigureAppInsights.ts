import dotenv from 'dotenv';
dotenv.config();

import * as appInsights from "applicationinsights";

export const ConfigureAppInsights = () => {

    if (!process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
        console.warn('No App Insights connection string (APPLICATIONINSIGHTS_CONNECTION_STRING) provided! App Insights will not be enabled')
        return 
    }

    // All this stuff is great but I want to keep things cheap in Azure. Might turn some back on later
    appInsights.setup()
        .setAutoCollectConsole(false)
        .setAutoCollectHeartbeat(false)
        .setAutoCollectIncomingRequestAzureFunctions(false)
        .setAutoCollectPerformance(false)

        .setAutoCollectDependencies(true)
        .setAutoCollectExceptions(true)
        .setAutoCollectRequests(true)

        .setSendLiveMetrics(false)
        .setInternalLogging(false)

    appInsights.start()

}