// api/sourcing.js
// LaRuche.ai Backend - AliExpress Sourcing API

export default async function handler(req, res) {
  // ============================================================================
  // CORS CONFIGURATION
  // ============================================================================
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed. Use GET.' 
    });
  }

  // ============================================================================
  // PARAMETERS
  // ============================================================================
  const { keywords } = req.query;
  const searchTerm = keywords || 'trending';

  console.log(`[LaRuche.ai] 🔍 Recherche: ${searchTerm}`);

  try {
    // ============================================================================
    // FETCH ALIEXPRESS DATA
    // ============================================================================
    const apiUrl = `https://aliexpress-true-api.p.rapidapi.com/products?keywords=${encodeURIComponent(searchTerm)}&page_no=1&page_size=40&ship_to_country=FR&target_currency=EUR&target_language=FR`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'aliexpress-true-api.p.rapidapi.com'
      }
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    console.log(`[LaRuche.ai] 📦 Réponse API reçue`);

    // ============================================================================
    // EXTRACT PRODUCTS (MULTIPLE PATHS)
    // ============================================================================
    const rawItems = 
      data?.data?.products || 
      data?.result?.items ||
      data?.result?.item ||
      data?.items ||
      data?.products ||
      [];

    if (!Array.isArray(rawItems)) {
      console.error('[LaRuche.ai] ❌ Format de réponse invalide');
      return res.status(200).json({
        success: false,
        count: 0,
        products: [],
        error: 'Invalid response format from AliExpress API'
      });
    }

    console.log(`[LaRuche.ai] 📊 Produits bruts: ${rawItems.length}`);

    // ============================================================================
    // TRANSFORM WITH LARUCHE.AI INTELLIGENCE
    // ============================================================================
    const products = rawItems
      .filter(item => item && (item.product_id || item.item_id || item.id))
      .map(item => {
        // === EXTRACTION ===
        const id = String(item.product_id || item.item_id || item.id);
        
        const title = (
          item.product_title || 
          item.title ||
          item.name ||
          'Produit AliExpress'
        ).substring(0, 200);

        const image = 
          item.product_main_image_url || 
          item.main_url ||
          item.image_url ||
          item.pic_url ||
          'https://via.placeholder.com/400';

        const costPrice = parseFloat(
          item.app_sale_price || 
          item.target_sale_price || 
          item.sale_price ||
          item.price ||
          0
        );

        const shippingCost = parseFloat(
          item.shipping_fee || 
          item.logistics_fee ||
          0
        );

        const sales = parseInt(
          item.last_month_num || 
          item.sales_count || 
          item.volume ||
          0
        );

        const rating = parseFloat(
          item.evaluate_rate || 
          item.rating ||
          item.star ||
          4.5
        );

        const link = 
          item.product_detail_url || 
          item.item_url ||
          `https://aliexpress.com/item/${id}.html`;

        // === LARUCHE.AI INTELLIGENCE ===
        const AD_COST = 10;
        const MULTIPLIER = 3;

        const suggestedPrice = costPrice * MULTIPLIER;
        const totalCost = costPrice + shippingCost + AD_COST;
        const netProfit = suggestedPrice - totalCost;
        const profitMargin = suggestedPrice > 0 ? (netProfit / suggestedPrice) * 100 : 0;

        // Saturation Analysis
        let saturationStatus = 'niche';
        let saturationScore = 15;

        if (sales >= 2000) {
          saturationStatus = 'saturated';
          saturationScore = 85;
        } else if (sales >= 500) {
          saturationStatus = 'hot';
          saturationScore = 65;
        }

        const shippingOptimized = shippingCost <= 5;

        return {
          id,
          title,
          image,
          price: `${costPrice.toFixed(2)}€`,
          cost_price: costPrice,
          shipping_cost: shippingCost,
          suggested_price: parseFloat(suggestedPrice.toFixed(2)),
          total_cost: parseFloat(totalCost.toFixed(2)),
          net_profit: parseFloat(netProfit.toFixed(2)),
          profit_margin: parseFloat(profitMargin.toFixed(2)),
          saturation_status: saturationStatus,
          saturation_score: saturationScore,
          shipping_optimized: shippingOptimized,
          rating: parseFloat(rating.toFixed(1)),
          sales,
          link
        };
      })
      .filter(p => p.cost_price > 0 && p.net_profit > 0);

    console.log(`[LaRuche.ai] ✅ Produits transformés: ${products.length}`);

    // ============================================================================
    // RESPONSE
    // ============================================================================
    res.status(200).json({
      success: true,
      count: products.length,
      products,
      metadata: {
        search_term: searchTerm,
        timestamp: new Date().toISOString(),
        powered_by: 'LaRuche.ai'
      }
    });

  } catch (error) {
    console.error(`[LaRuche.ai] ❌ Erreur:`, error);

    res.status(500).json({
      success: false,
      error: error.message,
      products: []
    });
  }
}
