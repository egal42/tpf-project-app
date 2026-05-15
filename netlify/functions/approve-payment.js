exports.handler = async function(event) {

  try {

    console.log("approve-payment called");
    console.log("event.body:", event.body);

    const body = JSON.parse(event.body);
    const paymentId = body.paymentId;

    console.log("paymentId:", paymentId);
    console.log("PI_API_KEY exists:", !!process.env.PI_API_KEY);

    const response = await fetch(
      `https://api.minepi.com/v2/payments/${paymentId}/approve`,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${process.env.PI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const text = await response.text();

    console.log("Pi approve status:", response.status);
    console.log("Pi approve response:", text);

    return {
      statusCode: response.status,
      body: text
    };

  } catch (error) {

    console.error("Approve payment error:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message
      })
    };

  }

};
