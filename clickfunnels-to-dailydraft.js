// Extracts the email from the ClickFunnels 2.0 webhook payload
function findEmail(payload) {
  // ClickFunnels 2.0 typically sends the contact data inside a 'data' object
  return (
    payload?.data?.email_address ||
    payload?.data?.email ||
    payload?.email_address ||
    payload?.email ||
    null
  );
}

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify the secret to ensure the request is actually from your ClickFunnels account
  const providedSecret = req.query.secret || req.headers["x-webhook-secret"];
  if (providedSecret !== process.env.CLICKFUNNELS_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Extract the email
  const email = findEmail(req.body);

  if (!email) {
    console.log("No email found in ClickFunnels payload:", JSON.stringify(req.body));
    return res.status(400).json({ error: "No email found in webhook payload" });
  }

  try {
    // Send the email to DailyDraft
    const dailyDraftResponse = await fetch(
      "https://www.dailydraft.ai/api/v1/subscribers",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.DAILYDRAFT_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email } )
      }
    );

    const responseText = await dailyDraftResponse.text();
    let responseBody;
    
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = { raw: responseText };
    }

    if (!dailyDraftResponse.ok) {
      console.error("DailyDraft error:", dailyDraftResponse.status, responseBody);
      return res.status(502).json({
        error: "DailyDraft rejected the subscriber",
        status: dailyDraftResponse.status,
        details: responseBody
      });
    }

    return res.status(200).json({
      success: true,
      email,
      dailyDraft: responseBody
    });
    
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
