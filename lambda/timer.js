
const TIMERS_PERMISSION = 'alexa::alerts:timers:skill:readwrite'

const timerConfig = {
    noodle: {
        'ラ王': 3,
        'どん兵衛': 5
    },
    softy: {
        'かため': -1,
        'やわらかめ': 1
    }
}

/**
 * duration の文字列形式 ISO8601 継続期間にコンバートする
 * @param {*} noodleName カップ麺の名前
 * @param {*} softyOrMinutes 麺のかたさ or 分
 */
const getAlexaDuration = (noodleName, softyOrMinutes) => {
    console.log(noodleName, softyOrMinutes)
    const extra = parseInt(softyOrMinutes)
    const duration = (isNaN(extra))
        ? timerConfig.noodle[noodleName] + timerConfig.softy[softyOrMinutes]
        : extra
    const durationString = `PT${duration}M`
    console.log('Duration:', durationString)
    return durationString
}

const message = {
    locale: 'ja-JP',
    label: (noodle) => `${noodle} ができるまであと...`,
    done: (noodle) => { 
        return `${noodle} ができました。冷めないうちにどうぞ！`
    }
}

const getTimerTemplate = (noodle, softyOrMinutes) => {
    return {
        duration: getAlexaDuration(noodle, softyOrMinutes),
        label: message.label(noodle, softyOrMinutes),
        creationBehavior: {
            displayExperience: {
                visibility: 'VISIBLE'
            }
        },
        triggeringBehavior: {
            operation: {
                type : 'ANNOUNCE',
                textToAnnounce: [{
                    locale: 'ja-JP',
                    text: message.done(noodle)
                }]
            },
            notificationConfig: {
                playAudible: true
            }
        }
    }
}

/**
 * Timer が許可されてなかったら、許可してもいいかユーザーに尋ねる
 * @param {*} handlerInput
 * @returns 許可されてなかったら、許可を尋ねるレスポンスを返す
 * 許可されてれば nullを。
 */
module.exports = {
    verifyConsentToken: (handlerInput) => {
        let {requestEnvelope} = handlerInput;
        const {permissions} = requestEnvelope.context.System.user;
        if (!(permissions && permissions.consentToken)){
            console.log('No permissions found!');
            return {
                type: 'Connections.SendRequest',
                'name': 'AskFor',
                'payload': {
                    '@type': 'AskForPermissionsConsentRequest',
                    '@version': '1',
                    'permissionScope': TIMERS_PERMISSION
                },
                token: 'verifier'
            }
        }
        console.log('Permissions found: ' + permissions.consentToken);
        return null;
    },
    /**
     * Timerを有効にしたかどうかの応答状況を返す
     * @param {} handlerInput 
     */
    permissionCallback: (handlerInput) => {
        console.log('Handler: AskForResponseHandler');
        const {request} = handlerInput.requestEnvelope;
        const {payload, status} = request;
        console.log('Connections response status + payload: ' + status + ' - ' + JSON.stringify(payload));

        return {
            code: status.code,
            status: payload.status,
            isCardThrown: payload.isCardThrown
        }
    },
    runTimer: async (handlerInput, noodle, softy) => {
        const {attributesManager, serviceClientFactory} = handlerInput;
    
        try {
            const timerServiceClient = serviceClientFactory.getTimerManagementServiceClient();
            const timerResponse = await timerServiceClient.createTimer(
                getTimerTemplate(noodle, softy)
            )
    
            const timerId = timerResponse.id;
            const timerStatus = timerResponse.status;
            console.log(timerResponse)

            const sessionAttributes = attributesManager.getSessionAttributes();
            sessionAttributes['lastTimerId'] = timerId
            sessionAttributes['noodle'] = noodle
            sessionAttributes['softy'] = softy
            if(timerStatus === 'ON') {
                sessionAttributes['lastTimerStatus'] = timerStatus
                return sessionAttributes
            } else {
                sessionAttributes['error'] = 308 
                sessionAttributes['errorKey'] = 'TIMER_DID_NOT_START'
                return sessionAttributes
            }
        } catch (e) {
            console.log(e)
            sessionAttributes['error'] = e.statusCode
            sessionAttributes['errorKey'] = 'TIMER_DID_NOT_START'
            return sessionAttributes
        }
    }
}

