/**
 * Purchases VTU data (or airtime) from the configured provider.
 * @param {Object} params
 * @param {string} params.network - The network code (e.g. MTN, Airtel, Glo, 9mobile)
 * @param {string} params.phone - The customer phone number
 * @param {string} params.planId - The plan identification code or "airtime"
 * @param {number} params.amount - The purchase amount
 * @returns {Promise<Object>} Object containing success, status, providerResponse, and reference
 */
export async function purchaseData({ network, phone, planId, amount }) {
  const vtuBaseUrl = process.env.VTU_BASE_URL || "https://api.vtuprovider.com/v1";
  const vtuApiKey = process.env.VTU_API_KEY;
  const vtuApiSecret = process.env.VTU_API_SECRET;

  console.log(`[VTU SERVICE DISPATCH] Network: ${network}, Phone: ${phone}, PlanId: ${planId}, Amount: ${amount}`);

  // If environment variables are not set or contain dummy setup, use simulation mode
  if (!vtuApiKey || vtuApiKey === "your_vtu_api_key" || vtuApiKey.includes("test_dummy")) {
    console.log("[VTU SERVICE SIMULATION] API Credentials are not configured. Running successful sandbox purchase transaction.");
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Auto-fail for numbers ending in 99 in sandbox mode to demonstrate failed transaction handling & auto-refunds
    if (phone.endsWith("99") || phone.endsWith("999")) {
      return {
        success: false,
        status: 'failed',
        reference: `SIM-ERR-${Date.now()}`,
        providerResponse: { error: "Simulated carrier gateway timeout", code: "PROVIDER_TIMEOUT" }
      };
    }

    return {
      success: true,
      status: 'completed',
      reference: `SIM-VTU-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      providerResponse: { message: "Simulated success response from VTU gateway", code: "SUCCESS" }
    };
  }

  try {
    const payload = {
      network: network.toUpperCase(),
      phone,
      plan_id: planId,
      amount: Number(amount),
    };

    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${vtuApiKey}`,
      "X-API-Secret": vtuApiSecret || ""
    };

    console.log(`[VTU API HTTP DISPATCH] POST ${vtuBaseUrl}/purchase with payload:`, JSON.stringify(payload));
    const response = await fetch(`${vtuBaseUrl}/purchase`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const resBody = await response.json().catch(() => ({}));
    console.log(`[VTU API HTTP RESPONSE] Status: ${response.status}`, resBody);

    if (response.ok && (resBody.status === "success" || resBody.success || resBody.status === "completed")) {
      return {
        success: true,
        status: 'completed',
        reference: resBody.reference || resBody.id || `VTU-API-${Date.now()}`,
        providerResponse: resBody
      };
    } else {
      return {
        success: false,
        status: 'failed',
        reference: resBody.reference || `VTU-API-ERR-${Date.now()}`,
        providerResponse: resBody
      };
    }
  } catch (err) {
    console.error("[VTU Service Http Exception]:", err);
    return {
      success: false,
      status: 'failed',
      reference: `VTU-ERR-${Date.now()}`,
      providerResponse: { error: err.message || "API Connection error" }
    };
  }
}
export default { purchaseData };
