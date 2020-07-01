const AWS = require('aws-sdk');
const Alexa = require('ask-sdk');
const ddbAdapter = require('ask-sdk-dynamodb-persistence-adapter');
const s3Adapter = require('ask-sdk-s3-persistence-adapter');
const talk = require('./talk')
const timer = require('./timer')

let storage = null
let session = {}

// Synonym で定義したidをキーとして扱いたいので、slotの構造から直接取る。
function getSynonymValues(handlerInput, key) {
  try{
    const slot = Alexa.getSlot(handlerInput.requestEnvelope, key)
    const resolutions = slot.resolutions
    if (resolutions) {
      return resolutions.resolutionsPerAuthority[0].values[0].value.name.toLowerCase()
    } else {
      return slot.value
    }
  } catch (e) {
    console.log(e)
    return ''
  }
}

// PersistentAttributesとSessionAttributesはHandlerが処理される前に必ずあるようにしたいので、
// Interceptor に実装
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

// Attributesの保存は、handlerが呼ばれたあとの共通処理で実装(=ResponseInterceptorss)
const ResponseInterceptor = {
  async process(handlerInput) {
    storage.visit = "1"
    const { attributesManager } = handlerInput;
    await attributesManager.savePersistentAttributes(storage);
    attributesManager.setSessionAttributes(session);
  }
};

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
    // Timer を使うには ユーザーの許可が必要。有効になってなければ声で促す
    const directive = timer.verifyConsentToken(handlerInput)
    console.log(directive)
    if (directive) return talk.launch(handlerInput.responseBuilder, storage, directive)

    return talk.launch(handlerInput.responseBuilder, storage)
  },
};

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
    const sessionAttributesOrError = await timer.runTimer(
      handlerInput, 
      noodle, (minutes) ? minutes : softy)
    
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
