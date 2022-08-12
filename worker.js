addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

addEventListener('scheduled', event => {
  event.waitUntil(
    handleRequest(event.scheduledTime)
  );
});

async function sendText(to, response) {
  const endpoint = 'https://api.twilio.com/2010-04-01/Accounts/' + TWILIO_ACCOUNT_SID + '/Messages.json';

  const message = `${response.domain} is not loading as expected: Response Code ${response.request}`;

  let encoded = new URLSearchParams();
  encoded.append('To', to);
  encoded.append('MessagingServiceSid', TWILIO_SERVICE_SID);
  encoded.append('Body', message);

  let token = btoa(TWILIO_ACCOUNT_SID + ':' + TWILIO_AUTH_TOKEN);

  const request = {
    body: encoded,
    method: 'POST',
    headers: {
      'Authorization': `Basic ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };

  return await fetch(endpoint, request);
}

async function sendEmail(to, response) {
  const endpoint = 'https://api.postmarkapp.com/email/withTemplate';
  const body = {
    From: 'site-status@bradleymorris.co.uk',
    To: to,
    TemplateAlias: 'service-status-update',
    TemplateModel: response,
    MessageStream: POSTMARK_MESSAGE_STREAM,
  };

  const request = {
    method: "POST",
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': POSTMARK_SERVER_TOKEN,
    },
    body: JSON.stringify(body)
  };

  return fetch(endpoint, request);
}

async function handleRequest(incomingRequest) {
  const domain = DOMAIN;
  const request = await fetch(domain);
  const body = await request.text();

  const selector = /uk\-section/g;
  const match = body.match(selector);

  const isAlive = match.length > 0 && request.status === 200;

  const response = {
    responseCode: request.status,
    targetTagCount: match.length,
    isAlive,
    domain,
  };

  if (isAlive) {
    return new Response(JSON.stringify(response));
  }

  const notificationQueue = [];

  if (EMAIL_TO) {
    const emailNotifications = JSON.parse(EMAIL_TO).map(email => sendEmail(email, response));
    notificationQueue.push(...emailNotifications);
  }

  if (SMS_TO) {
    const smsNotifications = JSON.parse(SMS_TO).map(to => sendText(to, response));
    notificationQueue.push(...smsNotifications);
  }

  await Promise.all(notificationQueue);

  return new Response(JSON.stringify(response));
}