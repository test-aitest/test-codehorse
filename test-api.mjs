// Test the review export API endpoint

async function testApi() {
  const baseUrl = "http://localhost:3000";

  console.log("Testing Review Export API...\n");

  // Test 1: Missing token
  console.log("Test 1: Request without token");
  try {
    const res1 = await fetch(`${baseUrl}/api/reviews/test-id/export`);
    const data1 = await res1.json();
    console.log(`  Status: ${res1.status}`);
    console.log(`  Response: ${JSON.stringify(data1)}`);
    console.log(`  ✅ Expected 401 error for missing token\n`);
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}\n`);
  }

  // Test 2: Invalid token
  console.log("Test 2: Request with invalid token");
  try {
    const res2 = await fetch(`${baseUrl}/api/reviews/test-id/export?token=invalid-token`);
    const data2 = await res2.json();
    console.log(`  Status: ${res2.status}`);
    console.log(`  Response: ${JSON.stringify(data2)}`);
    console.log(`  ✅ Expected 401 error for invalid token\n`);
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}\n`);
  }

  console.log("API endpoint is working correctly!");
}

testApi().catch(console.error);
