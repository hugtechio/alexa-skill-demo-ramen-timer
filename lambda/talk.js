const timer = require("./timer")

// レスポンス組み立て
const response = (builder, data, directive = null) => {
    if (directive) {
        // directive 返す時は他の要素はレスポンスに足してはいけない
        builder = builder.addDirective(directive)
    } else {
        builder = builder
            .speak(data.speak)
            .reprompt(data.reprompt)
            .withShouldEndSession(data.shouldEndSession)
    }
    return builder.getResponse()
}

// インテントと対になるように設計。第２引数のパラメータを必要なら使ってメッセージを組み立てる。
// Keyの値は、Alexaのキーワードにできるだけ揃ておくと、キーワードの余計な判断や置換が減ってよい。
module.exports = {
    launch: (responseBuilder, storage, timerAskDirective = null) => {
        if (timerAskDirective) {
            return responseBuilder(responseBuilder,{
                speak: '',
                reprompt: '',
                shouldEndSession: false,
                directive: timerAskDirective
            })
        }
        if (Object.keys(storage).length === 0) {
            return response(responseBuilder, {
                speak: 'こんにちは。カップ麺タイマーです。カップ麺にお湯を入れたら、アレクサ、カップ麺タイマーを起動して、５分ね。と、私を呼び出してください。',
                reprompt: 'カップ麺にお湯を入れたら時間を教えてください。',
                shouldEndSession: false
            })
        } else {
            return response(responseBuilder, {
                speak: 'こんにちは。カップ麺タイマーです。今日はどんなカップ麺を食べますか？',
                reprompt: 'カップ麺にお湯を入れたら時間を教えてください。',
                shouldEndSession: false
            })        
        }
    },
    /**
     * Timerの有効状態をチェックしてレスポンスを変える
     */
    AskFor: (responseBuilder, permission) => {
        const permissionCard = {
            speak: 'Alexaアプリに、このスキルがタイマーを使用することを許可するためのカードを送りました。権限を許可した後に、もう一度このスキルを呼び出してください。。',
            reprompt: 'タイマーを使うためのカードを送りました。',
            shouldEndSession: true           
        }

        const talkMap = {
            ACCEPTED: (permission) => {
                return {
                    speak: 'タイマーを有効にしました。今日のカップ麺楽しんでください。',
                    reprompt: 'さあ、カップ麺、作りましょう',
                    shouldEndSession: false
                }
            },
            DENIED: (permission) => {
                if (permission.isCardThrown) {
                    return permissionCard
                }
                return {
                    speak: '私はタイマーがないと、あなたのお役(やく)に立てません。タイマーをオンにしてくれるとうれしいです。',
                    reprompt: '私を使う場合は、タイマーを有効にしてください',
                    shouldEndSession: true
                }
            },
            NOT_ANSWERED: (permission) => {
                if (permission.isCardThrown) {
                    return permissionCard
                }
                return {
                    speak: '私はタイマーがないと、あなたのお役(やく)に立てません。タイマーをオンにしてくれるとうれしいです。',
                    reprompt: '私を使う場合は、タイマーを有効にしてください',
                    shouldEndSession: true
                }
            }
        }
        if (permission.code === '400') {
            console.log('You forgot to specify the permission in the skill manifest!')
        }

        return response(responseBuilder,
            talkMap[permission.status](permission)
        )
    },
    /**
     * タイマーを起動する。
     * Extra) だめだったら、標準タイムで起動しておく。
     * (失敗してもお湯は入れてしまってるので、もう一回セットするとベストなタイミングで食べられないw)
     */
    SetNoodleTimerIntent: (responseBuilder, sessionAttributesOrError) => {
        const talkMap = {
            'TIMER_DID_NOT_START': (params) => {
                return {
                    speak: `${params.noodle} の タイマー を開始できませんでした。ごめんなさい。`,
                    reprompt: `もう一回トライしてみてください。`,
                    shouldEndSession: true,
                }
            },
            'ON': (params) => {
                return {
                    speak: `${params.noodle} を ${params.softy} ですね？ できたらお知らせしますね？`,
                    reprompt: ``,
                    shouldEndSession: true,
                }
            }
        }
        console.log(sessionAttributesOrError)
        if (sessionAttributesOrError.error) {
            return response(
                responseBuilder,
                talkMap[sessionAttributesOrError.errorKey](sessionAttributesOrError.noodle)
            )
        } else {
            return response(responseBuilder, 
                talkMap[sessionAttributesOrError.lastTimerStatus](sessionAttributesOrError)
            )
        }
    },
    exit: (responseBuilder) => {
        return response(responseBuilder, {
            speak: 'またカップ麺食べたくなったら呼んでくださいね？',
            reprompt: ''
        })
    },
    help: (responseBuilder) => {
        return response(responseBuilder, {
            speak: 'カップ麺にお湯を入れて私を呼び出してください。どん兵衛を固めで食べたかったら、「アレクサ、カップ麺タイマーを開いて、どん兵衛を固めで」、と言ってください。',
            reprompt: ''
        })
    },
    unhandled: (responseBuilder) => {
        return response(responseBuilder, {
            speak: 'カップ麺にお湯を入れて私を呼び出してください。どん兵衛を固めで食べたかったら、「アレクサ、カップ麺タイマーを開いて、どん兵衛を固めで」、と言ってください。',
            reprompt: ''
        })
    },
    error: (responseBuilder, session) => {
        console.log(session)
        if (session) {
            return response(responseBuilder, {
                speak: '今から食べるカップ麺の時間を教えてください。終了するには「とめて」と言ってください。',
                reprompt: 'もう一度教えてください。',
                shouldEndSession: false
            })     
        }
        return response(responseBuilder, {
            speak: 'すみません。聞き取れませんでした。もう一度教えてください。終了するには「とめて」と言ってください。',
            reprompt: 'もう一度教えてください。',
            shouldEndSession: false
        })
    },
    fallback: (responseBuilder) => {
        return response(responseBuilder, {
            speak: 'すみません。聞き取れませんでした。もう一度教えてください。',
            reprompt: 'もう一度教えてください。'
        })
    }
}