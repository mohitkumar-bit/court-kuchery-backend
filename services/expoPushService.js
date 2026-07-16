const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const isExpoPushToken = (token) =>
  typeof token === "string" &&
  (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["));

const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

/**
 * Send push notifications via Expo Push API.
 * @returns {{ sent: number, failed: number }}
 */
async function sendExpoPushNotifications(
  tokens,
  { title, body, data = {}, channelId = "default", priority = "high" }
) {
  const validTokens = [...new Set(tokens.filter(isExpoPushToken))];
  if (!validTokens.length) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  const chunks = chunkArray(validTokens, 100);

  for (const chunk of chunks) {
    const messages = chunk.map((to) => ({
      to,
      sound: "default",
      title,
      body,
      data,
      priority,
      channelId,
    }));

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });

      const result = await response.json();
      const tickets = result.data || [];

      tickets.forEach((ticket) => {
        if (ticket.status === "ok") sent += 1;
        else failed += 1;
      });

      if (!tickets.length && !response.ok) {
        failed += chunk.length;
      }
    } catch (err) {
      console.error("Expo push batch error:", err.message);
      failed += chunk.length;
    }
  }

  return { sent, failed };
}

module.exports = {
  sendExpoPushNotifications,
  isExpoPushToken,
};
