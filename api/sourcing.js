// api/sourcing.js
// LaRuche.ai Backend - VERSION FINALE CORRECTE

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { keywords } = req.query;
  const searchTerm = keywords || 'trending';

  console.log(`[LaRuche.ai] 🔍 Recherche: ${searchTerm}`);

  try {
    // ============================================================================
    // ENDPOINT CORRECT : /api/v3/products
    // ============================================================================
    const apiUrl = `https://aliexpress-true-api.p.rapidapi.com/api/v3/products?keywords=${encodeURIComponent(searchTerm)}&page_no=1&page_size=40&ship_to_country=FR&target_currency=EUR&target_language=FR&sort=SALE_PRICE_ASC`;
    
    console.log(`[LaRuche.ai] 📡 GET ${apiUrl}`);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'aliexpress-true-api.p.rapidapi.com'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[LaRuche.ai] ❌ HTTP ${response.status}:`, errorText);
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    console.log(`[LaRuche.ai] 📦 Réponse reçue, clés:`, Object.keys(data));

    // ============================================================================
    // EXTRACTION (chemins multiples pour robustesse)
    // ============================================================================
    const rawItems = 
      data?.data?.products || 
      data?.result?.items ||
      data?.result?.products ||
      data?.items ||
      data?.products ||
      data?.data ||
      [];

    if (!Array.isArray(rawItems)) {
      console.error(`[LaRuche.ai] ❌ rawItems n'est pas un array:`, typeof rawItems);
      return res.status(200).json({
        success: false,
        count: 0,
        products: [],
        debug: {
          message: 'Structure de réponse invalide',
          response_keys: Object.keys(data),
          raw_items_type: typeof rawItems,
          sample: JSON.stringify(data).substring(0, 500)
        }
      });
    }

    if (rawItems.length === 0) {
      console.log(`[LaRuche.ai] ⚠️ 0 produits trouvés pour "${searchTerm}"`);
      return res.status(200).json({
        success: true,
        count: 0,
        products: [],
        metadata: {
          search_term: searchTerm,
          message: 'Aucun produit trouvé'
        }
      });
    }

    console.log(`[LaRuche.ai] 📊 ${rawItems.length} produits bruts trouvés`);

    // ============================================================================
    // TRANSFORMATION AVEC LARUCHE.AI INTELLIGENCE
    // ============================================================================
    const products = rawItems
      .filter(item => item && (item.product_id || item.item_id || item.id))
      .map((item, index) => {
        // === EXTRACTION BASIQUE ===
        const id = String(
          item.product_id || 
          item.item_id || 
          item.id ||
          `product_${index}`
        );

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

        // Prix (essayer toutes les variantes)
        const costPrice = parseFloat(
          item.app_sale_price || 
          item.target_sale_price || 
          item.sale_price ||
          item.price ||
          item.target_app_sale_price_value ||
          0
        );

        // Shipping
        const shippingCost = parseFloat(
          item.shipping_fee || 
          item.logistics_fee ||
          0
        );

        // Ventes
        const sales = parseInt(
          item.last_month_num || 
          item.sales_count || 
          item.volume ||
          0
        );

        // Rating
        const rating = parseFloat(
          item.evaluate_rate || 
          item.rating ||
          item.star ||
          4.5
        );

        // Lien
        const link = 
          item.product_detail_url || 
          item.item_url ||
          `https://www.aliexpress.com/item/${id}.html`;

        // === LARUCHE.AI INTELLIGENCE ===
        const AD_COST = 10; // CPA moyen
        const MULTIPLIER = 3; // Prix de vente = Coût × 3

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

        // Log premier produit pour debug
        if (index === 0) {
          console.log(`[LaRuche.ai] Premier produit:`, {
            id,
            title: title.substring(0, 50),
            costPrice,
            shippingCost,
            sales,
            rating,
            netProfit
          });
        }

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

    console.log(`[LaRuche.ai] ✅ ${products.length} produits valides et rentables`);

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
        powered_by: 'LaRuche.ai',
        api_endpoint: '/api/v3/products'
      }
    });

  } catch (error) {
    console.error(`[LaRuche.ai] ❌ Erreur:`, error);

    res.status(500).json({
      success: false,
      error: error.message,
      products: [],
      debug: {
        error_stack: error.stack?.substring(0, 500)
      }
    });
  }
}
