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
  const searchTerm = keywords || 'laptop';

  console.log(`[LaRuche.ai] 🔍 Recherche: ${searchTerm}`);

  try {
    // ============================================================================
    // API ALIEXPRESS /api/v3/products
    // ============================================================================
    const apiUrl = `https://aliexpress-true-api.p.rapidapi.com/api/v3/products?keywords=${encodeURIComponent(searchTerm)}&page_no=1&page_size=40&ship_to_country=FR&target_currency=EUR&target_language=FR&sort=SALE_PRICE_ASC`;
    
    console.log(`[LaRuche.ai] 📡 Appel API`);

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
    
    console.log(`[LaRuche.ai] 📦 Réponse reçue`);

    // ============================================================================
    // EXTRACTION : products.product (structure confirmée)
    // ============================================================================
    const rawItems = data?.products?.product || [];

    if (!Array.isArray(rawItems)) {
      console.error(`[LaRuche.ai] ❌ products.product n'est pas un array`);
      return res.status(200).json({
        success: false,
        count: 0,
        products: [],
        debug: {
          message: 'Structure invalide',
          has_products: !!data?.products,
          has_product: !!data?.products?.product,
          type: typeof rawItems
        }
      });
    }

    if (rawItems.length === 0) {
      console.log(`[LaRuche.ai] ⚠️ 0 produits pour "${searchTerm}"`);
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

    console.log(`[LaRuche.ai] 📊 ${rawItems.length} produits trouvés`);

    // ============================================================================
    // TRANSFORMATION
    // ============================================================================
    const products = rawItems
      .filter(item => item && item.product_id)
      .map((item, index) => {
        // ID
        const id = String(item.product_id);

        // Titre
        const title = (item.product_title || 'Produit').substring(0, 200);

        // Image
        const image = item.product_main_image_url || 'https://via.placeholder.com/400';

        // Prix (target_sale_price est en EUR déjà)
        const costPrice = parseFloat(item.target_sale_price || item.target_app_sale_price || 0);

        // Shipping (pas fourni par cette API, on estime)
        const shippingCost = costPrice > 50 ? 0 : 5; // Gratuit si > 50€

        // Ventes
        const sales = parseInt(item.lastest_volume || 0);

        // Rating (pas fourni, on met 4.5 par défaut)
        const rating = 4.5;

        // Lien
        const link = item.product_detail_url || `https://fr.aliexpress.com/item/${id}.html`;

        // === LARUCHE.AI INTELLIGENCE ===
        const AD_COST = 10;
        const MULTIPLIER = 3;

        const suggestedPrice = costPrice * MULTIPLIER;
        const totalCost = costPrice + shippingCost + AD_COST;
        const netProfit = suggestedPrice - totalCost;
        const profitMargin = suggestedPrice > 0 ? (netProfit / suggestedPrice) * 100 : 0;

        // Saturation
        let saturationStatus = 'niche';
        let saturationScore = 15;

        if (sales >= 2000) {
          saturationStatus = 'saturated';
          saturationScore = 85;
        } else if (sales >= 500) {
          saturationStatus = 'hot';
          saturationScore = 65;
        } else if (sales >= 100) {
          saturationStatus = 'emerging';
          saturationScore = 40;
        }

        const shippingOptimized = shippingCost <= 5;

        // Log premier produit
        if (index === 0) {
          console.log(`[LaRuche.ai] Premier produit:`, {
            id,
            title: title.substring(0, 50),
            costPrice,
            netProfit,
            sales
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
          rating,
          sales,
          link
        };
      })
      .filter(p => p.cost_price > 0 && p.net_profit > 0);

    console.log(`[LaRuche.ai] ✅ ${products.length} produits valides`);

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
        total_available: data?.total_record_count || products.length
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
