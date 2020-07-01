const AWS = require('aws-sdk');
const Alexa = require('ask-sdk');
const ddbAdapter = require('ask-sdk-dynamodb-persistence-adapter');
const s3Adapter = require('ask-sdk-s3-persistence-adapter');
const talk = require('./talk')
const timer = require('./timer')

let storage = null // persistence attributes
let session = {} // session attributes

// Synonym で定義したnameをキーとして扱いたいので、slotの構造から直接取る
function getSynonymValues(handlerInput, key) {
  try{
    const slot = Alexa.getSlot(handlerInput.requestEnvelope, key)
    const resolutions = slot.resolutions
    if (resolutions) {
      return resolutions.resolutionsPerAuthority[0].values[0].value.name.toLowerCase()
    } else {
      // AMAZON.NUMBER は Synonym の resolutions プロパティがないので、value を直接取る
      return slot.value
    }
  } catch (e) {
    console.log(e)
    return ''
  }
}



/**
 * PersistentAttributes と SessionAttributes は Handler が処理される前に必ず存在するようにしたいので、
 * Interceptor に実装
 */
const RequestInterceptor = {
  async process(handlerInput) {
    console.log(handlerInput.requestEnvelope.request.intent)
    const { attributesManager } = handlerInput;
    try {
      storage = await attributesManager.getPersistentAttributes() || {};
    } catch (e) {
      storage = {}
    }
    session = attributesManager.getSessionAttributes();

    try {
      if (Object.keys(session).length === 0) {
        attributesManager.setSessionAttributes(session)      
      }
    } catch (error) {
      console.log(error)
      attributesManager.setSessionAttributes(session)  
    }
    console.log('storage:', storage)
    console.log('session:', session)
  }
};

/**
 * Attributesの保存は、handler が呼ばれたあとの共通処理で実装
 */
const ResponseInterceptor = {
  async process(handlerInput) {
    storage.visit = "1"
    const { attributesManager } = handlerInput;
    await attributesManager.savePersistentAttributes(storage);
    attributesManager.setSessionAttributes(session);
  }
};

/**
 * DynamoDB、S3　どっちでも選べるように実装
 * @param {} type 
 * @param {*} param 
 */
function getPersistenceAdapter(type, param = null) {
  const generator = {
    dynamodb: (tableName) => new ddbAdapter.DynamoDbPersistenceAdapter({
      tableName: tableName,
      createTable: true
    }),
    s3: (name=null) => new s3Adapter.S3PersistenceAdapter({
      bucketName: process.env.S3_PERSISTENCE_BUCKET,
      s3Client: new AWS.S3({apiVersion: 'latest', region: process.env.S3_PERSISTENCE_REGION})
    })
  }
  return generator[type](param)
}

const LaunchRequest = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  async handle(handlerInput) {
    // [課題1] ユーザーに Timer APIを許可してもらうよう尋ねる。
    // 
    // タイマーAPI を 使うには ユーザーの許可が必要です。
    // Alexa は Timer 機能がスキルで許可されてない場合にユーザーに尋ねることができます。
    //
    // やること
    // 1) timer.timer.verifyConsentToken(handlerInput) メソッド を呼び出して、Permission があるかどうか確認する
    // directive が返ってきた場合はタイマーが許可されていません。許可されていれば null が返ります。
    //
    // 2) talk.launch(handlerInput.responseBuilder, storage, <<1で取得したdirective>> ) メソッドを呼び出して、
    // ユーザーに タイマーを許可するか尋ねてください。
    // 
    // 3) verifyConsentToken メソッドの中身を編集して、ユーザーに タイマー利用の許可を尋ねるDirectiveを作ってください。
    const directive = '' // <<Not implemented>> [課題1-1] 
    console.log(directive)
    if (directive) return '' //<<Not implemented>> [課題1-2] 

    return talk.launch(handlerInput.responseBuilder, storage)
  },
};

/**
 * Timer の Permission を聞いたときの応答
 */
const AskForResponseHandler = {
  canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'Connections.Response'
          && handlerInput.requestEnvelope.request.name === 'AskFor';
  },
  async handle(handlerInput) {
    return timer.permissionCallback(handlerInput)
  }
}

const ExitHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
        || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    return talk.exit(handlerInput.responseBuilder)
  },
};

const SessionEndedRequest = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);
    return handlerInput.responseBuilder.getResponse();
  },
};

const HelpIntent = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' 
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    return talk.help(handlerInput.responseBuilder)
  }
};

const UnhandledIntent = {
  canHandle() {
    return true;
  },
  handle(handlerInput) {
    return talk.unhandled(handlerInput.responseBuilder)
  },
};

/**
 * タイマーセット用のインテント
 * noodle(カップ麺), softy(硬さ) or minutes(待ち時間) をSlotから取る
 */
const SetNoodleTimerIntent = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' 
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SetNoodleTimerIntent'
  },
  async handle(handlerInput) {
    const noodle = getSynonymValues(
      handlerInput, 'noodle'
    )
    const softy = getSynonymValues(
      handlerInput, 'softy'
    )
    const minutes = getSynonymValues(
      handlerInput, 'minutes'
    )

    console.log(noodle, softy, minutes)

    // [課題2] Timer起動
    // Slot から取り出した noodle, softy, minutes の 値を使って、timerを起動してください。
    // 
    // 呼び出す関数は、timer.runTimer(handlerInput, noodle, softy) です。
    // softy パラメータには、minutes もしくは softy どちらか 取れたほうを指定してください。
    // runTimer関数の戻り値は 起動したTimerとカップ麺の情報が含まれます。
    // レスポンスを作るのに使いますので、変数に格納しておいてください。
    // timer.runTimer は async function です。await おわすれなく。
    const sessionAttributesOrError = ''// <<Not implemented>> [課題2]
    
    // [課題3] レスポンス
    // talk.SetNoodleTimerIntent(responseBuilder, 課題3 で保存した変数) を呼び出して
    // レスポンスを返却してください。
    return talk.SetNoodleTimerIntent(
      handlerInput.responseBuilder,
      sessionAttributesOrError)
  }
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log(`Error handled: ${error.message}`);
    console.log(`Error stack: ${error.stack}`);

    return talk.error(handlerInput.responseBuilder, session.diagnosisAttributes)
  },
};

const FallbackHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent');
  },
  handle(handlerInput) {
    return talk.fallback(handlerInput.responseBuilder)
  },
};

const skillBuilder = Alexa.SkillBuilders.custom();
exports.handler = skillBuilder
  .withPersistenceAdapter(getPersistenceAdapter('s3', 'AlexaSkillDemoRamenTimer'))
  .addRequestHandlers(
    LaunchRequest,
    ExitHandler,
    SessionEndedRequest,
    SetNoodleTimerIntent,
    HelpIntent,
    FallbackHandler,
    UnhandledIntent,
  )
  .addRequestInterceptors(RequestInterceptor)
  .addErrorHandlers(ErrorHandler)
  .addResponseInterceptors(ResponseInterceptor)
  /** API 呼び出すクライアントを使う宣言 */
  .withApiClient(new Alexa.DefaultApiClient())
  .lambda();
