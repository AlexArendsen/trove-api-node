import * as appInsights from "applicationinsights";

const ai = appInsights.defaultClient

export const Log = {

    Event: (eventName: string, props: object) => {
        ai?.trackEvent({ name: eventName, properties: props })
        console.log(`[EVNT] ${ eventName }: ${JSON.stringify(props)}`)
    },

    Info: (eventName: string, message: string, props?: object) => {
        //ai?.trackEvent({ name: eventName, properties: { ...props, message } })
        console.log(`[INFO] ${ eventName }: ${ message } ${ props ? JSON.stringify(props) : '' }`)
    },

    Error: (er: Error, props?: object) => {
        ai?.trackException({ exception: er, properties: props })
        console.log(`[ERR!]`, er)
    },

    SetUser: (userId: string) => {
        ai.context.tags[ai.context.keys.userId] = userId
    }

}