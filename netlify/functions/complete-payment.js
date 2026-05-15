exports.handler = async function(event) {

  try {

    const body = JSON.parse(event.body);
    const paymentId = body.paymentId;
    const txid = body.txid;

    const formData = new URLSearchParams();
    formData.append("txid", txid);

    const response = await fetch(
      `https://api.minepi.com/v2/payments/${paymentId}/complete`,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${process.env.PI_API_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: formData.toString()
      }
    );

    const data = await response.json();

    console.log("Complete payment response:", data);

    return {
      statusCode: response.status,
      body: JSON.stringify(data)
    };

  } catch (error) {

    console.error("Complete payment error:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message
      })
    };

  }

};
