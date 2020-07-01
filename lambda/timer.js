
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
    // [課題4-4]
    // duration には 数値が入っています。単位は分(=M)で設定してください
    // https://ja.wikipedia.org/wiki/ISO_8601#%E7%B6%99%E7%B6%9A%E6%99%82%E9%96%93
    const durationString = // <<Not implemented>> [課題4-4] 
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
        // [課題4] タイマー起動のリクエスト作成
        // タイマーを起動するパラメーターを作成してください。
        // https://developer.amazon.com/ja-JP/docs/alexa/smapi/alexa-timers-api-reference.html#create-a-timer
        // 設定するパラメータは以下です。
        //
        // やること
        // 1. creationBehavior.displayExperience.visibility = 'VISIBLE'
        // 2. operation type: 'ANNOUNCE' --> タイマーが発火したときに一言言う。
        // 3. notificationConfig.playAudible = true --> 動作中のタイマーはスキルから抜けても操作できるように
        // 4. getAlexaDuration 関数を編集して、適切なISO8601文字列が返却されるようにしてください
        // 
        duration: getAlexaDuration(noodle, softyOrMinutes),
        label: message.label(noodle, softyOrMinutes),
        creationBehavior: {
            // <<Not implemented>>[課題4-1]
        },
        triggeringBehavior: {
            operation: {
                // <<Not implemented>>[課題4-2]
                textToAnnounce: [{
                    locale: 'ja-JP',
                    text: message.done(noodle)
                }]
            },
            notificationConfig: {
                // <<Not implemented]>>[課題4-3]
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
            // [課題1-3] ユーザーへ Timer API 利用のリクエストパラメータを構築する
            // https://developer.amazon.com/ja-JP/docs/alexa/smapi/voice-permissions-for-timers.html#send-a-connectionssendrequest-directive
            return {
                // <<Not implemented>> [課題1-3] 
                // ここに consent directive の JSONを作ってください。
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
            code: status.code, // HTTP Status Code。成功すると 200(Success) が設定されます
            status: payload.status,　// ACCEPTED, DENIED, NOT_ANSWERED のいずれか
            isCardThrown: payload.isCardThrown
        }
    },
    /**
     * Timer を起動する。起動したタイマーの状態を SessionAttributes に渡して、レスポンス時に利用
     */
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

            /** 作った Timer の情報を sessionAttributes に保存 */
            const sessionAttributes = attributesManager.getSessionAttributes();
            sessionAttributes['lastTimerId'] = timerId
            sessionAttributes['noodle'] = noodle
            sessionAttributes['softy'] = softy

            /** Timer の作成が成功(timerResponse.status === ON)していたら、 timerStatusを保存*/
            /** * timerStatus の 文字列がレスポンス作成するときのIDになるように設計している */
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

