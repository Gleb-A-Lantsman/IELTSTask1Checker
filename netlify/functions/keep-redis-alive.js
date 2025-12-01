const { Redis } = require("@upstash/redis");

exports.handler = async () => {
  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    // Simple heartbeat
    const timestamp = Date.now();
    await redis.set('heartbeat', timestamp);
    await redis.get('heartbeat');
    
    console.log(`✅ Redis heartbeat successful: ${timestamp}`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, timestamp })
    };
  } catch (error) {
    console.error('❌ Redis heartbeat failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
