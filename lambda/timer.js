
const TIMERS_PERMISSION = 'alexa::alerts:timers:skill:readwrite'

/**
 * Slot と Timer セット 時間のマップテーブル（単位：分）
 */
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

/**
 * タイマー起動のリクエストパラメーターを作成
 * @param {} noodle 
 * @param {*} softyOrMinutes 
 */
const getTimerTemplate = (noodle, softyOrMinutes) => {
    return {
        duration: getAlexaDuration(noodle, softyOrMinutes),
        timerLabel: message.label(noodle, softyOrMinutes),
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
    /**
     * Timer を起動する。起動したタイマーの状態を SessionAttributes に渡して、レスポンス時に利用
     */
    runTimer: async (handlerInput, noodle, softy) => {
        const {attributesManager, serviceClientFactory} = handlerInput;
        const sessionAttributes = attributesManager.getSessionAttributes(); 
        try {
            /** timerAPIClient を Factory から作る。serviceClientFactory.getTimerManagementServiceClient() */
            const timerServiceClient = serviceClientFactory.getTimerManagementServiceClient();
            /** timer作る。createTimer 関数*/
            const timerResponse = await timerServiceClient.createTimer(
                getTimerTemplate(noodle, softy)
            )
    
            const timerId = timerResponse.id;
            const timerStatus = timerResponse.status;
            console.log(timerResponse)

            /** 作った Timer の情報を sessionAttributes に保存 */
            sessionAttributes['lastTimerId'] = timerId
            sessionAttributes['noodle'] = noodle
            sessionAttributes['softy'] = softy

            /** Timer の作成が成功(timerResponse.status === ON)していたら、 */
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

