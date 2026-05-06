// api/webhook.js

import fetch from "node-fetch";

// ============================
// 🌐 ENV VARIABLES
// ============================
const {
  MESSAGEHUB_BASE_URL,
  MESSAGEHUB_API_TOKEN,
  MESSAGEHUB_ACCOUNT_ID,
  OPENAI_API_KEY
} = process.env;

// ============================
// 🔒 CONFIGURATION
// ============================

// Only allow this inbox
const ALLOWED_INBOX_IDS = [86];

// Persona for inbox 86
const PERSONAS = {
  86: `You are a professional, friendly, and highly effective customer service assistant for a business using ClickFunnels.

Your goals:
- Answer questions clearly and concisely
- Be polite, helpful, and confident
- Guide users toward solutions
- When appropriate, move the conversation toward booking, purchasing, or getting support
- Never be robotic—sound natural and human

If you don’t know something, be honest and offer to help find the answer.`
};

// ============================
// 🛠 HELPER FUNCTION
// ============================
function safeGet(obj, path, defaultValue = null) {
  try {
    return path.split(".").reduce((o, key) => o?.[key], obj) ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

// ============================
// 🚀 MAIN HANDLER
// ============================
export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== "POST") {
    return res.status(200).json({ message: "Ignored (not POST)" });
  }

  try {
    const payload = req.body;

    // ============================
    // 📥 EVENT FILTERING
    // ============================
    const event = payload?.event;
    const messageType = payload?.message_type;

    if (event !== "message_created" || messageType !== "incoming") {
      return res.status(200).json({ message: "Ignored (not relevant event)" });
    }

    // ============================
    // 📦 EXTRACT DATA SAFELY
    // ============================
    const inboxId = safeGet(payload, "inbox_id");
    const conversationId = safeGet(payload, "conversation.id");
    const messageContent = safeGet(payload, "content");

    // Validate required fields
    if (!inboxId || !conversationId || !messageContent) {
      return res.status(200).json({ message: "Ignored (missing required fields)" });
    }

    // ============================
    // 🔐 INBOX WHITELIST CHECK
    // ============================
    if (!ALLOWED_INBOX_IDS.includes(inboxId)) {
      return res.status(200).json({ message: "Ignored (inbox not allowed)" });
    }

    // ============================
    // 🧠 SELECT PERSONA
    // ============================
    const systemPrompt =
      PERSONAS[inboxId] || "You are a helpful assistant.";

    // ============================
    // 🤖 CALL OPENAI
    // ============================
    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: messageContent }
          ],
          temperature: 0.7
        })
      }
    );

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      console.error("OpenAI API error:", errText);
      throw new Error(`OpenAI request failed: ${openaiResponse.status}`);
    }

    const openaiData = await openaiResponse.json();
    const aiReply = safeGet(
      openaiData,
      "choices.0.message.content",
      "Sorry, something went wrong generating a response."
    );

    // ============================
    // 📤 SEND MESSAGE BACK TO MESSAGEHUB
    // ============================
    const replyUrl = `${MESSAGEHUB_BASE_URL}/api/v1/accounts/${MESSAGEHUB_ACCOUNT_ID}/conversations/${conversationId}/messages`;

    const mhResponse = await fetch(replyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        api_access_token: MESSAGEHUB_API_TOKEN
      },
      body: JSON.stringify({
        content: aiReply,
        message_type: "outgoing",
        private: false
      })
    });

    if (!mhResponse.ok) {
      const errText = await mhResponse.text();
      console.error("MessageHub API error:", errText);
      throw new Error(`MessageHub request failed: ${mhResponse.status}`);
    }

    // ============================
    // ✅ SUCCESS RESPONSE
    // ============================
    return res.status(200).json({ success: true });

  } catch (error) {
    // ============================
    // ❌ ERROR HANDLING (SAFE)
    // ============================
    console.error("Webhook error:", error);

    // Always return 200 to prevent retries
    return res.status(200).json({
      success: false,
      message: "Error handled safely"
    });
  }
}
