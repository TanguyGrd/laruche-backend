// api/sourcing.js
// LaRuche.ai Backend - Version Corrigée pour AliExpress True API

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
    // VERSION 1 : ESSAYER /api/products (le plus commun)
    // ============================================================================
    let apiUrl = `https://aliexpress-true-api.p.rapidapi.com/api/products?q=${encodeURIComponent(searchTerm)}&page=1&limit=40&currency=EUR&country=FR`;
    
    console.log(`[LaRuche.ai] 📡 Tentative 1: /api/products`);

    let response = await fetch(apiUrl, {
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'aliexpress-true-api.p.rapidapi.com'
      }
    });

    // Si 404, essayer un autre endpoint
    if (response.status === 404) {
      console.log(`[LaRuche.ai] ⚠️ 404 sur /api/products, essai /products`);
      
      apiUrl = `https://aliexpress-true-api.p.rapidapi.com/products?keywords=${encodeURIComponent(searchTerm)}&page_no=1&page_size=40&ship_to_country=FR&target_currency=EUR`;
      
      response = await fetch(apiUrl, {
        headers: {
          'x-rapidapi-key': process.env.RAPIDAPI_KEY,
          'x-rapidapi-host': 'aliexpress-true-api.p.rapidapi.com'
        }
      });
    }

    // Si toujours 404, essayer search
    if (response.status === 404) {
      console.log(`[LaRuche.ai] ⚠️ 404 sur /products, essai /search`);
      
      apiUrl = `https://aliexpress-true-api.p.rapidapi.com/search?query=${encodeURIComponent(searchTerm)}&page=1&limit=40`;
      
      response = await fetch(apiUrl, {
        headers: {
          'x-rapidapi-key': process.env.RAPIDAPI_KEY,
          'x-rapidapi-host': 'aliexpress-true-api.p.rapidapi.com'
        }
      });
    }

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    console.log(`[LaRuche.ai] 📦 Réponse reçue, clés:`, Object.keys(data));

    // ============================================================================
    // EXTRACTION MULTI-CHEMINS
    // ============================================================================
    const rawItems = 
      data?.data?.products || 
      data?.data?.items ||
      data?.result?.items ||
      data?.result?.products ||
      data?.items ||
      data?.products ||
      data?.data ||
      [];

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      console.log(`[LaRuche.ai] ⚠️ Aucun produit trouvé`);
      
      // Retourner structure de debug
      return res.status(200).json({
        success: false,
        count: 0,
        products: [],
        debug: {
          message: 'Aucun produit trouvé dans la réponse API',
          response_keys: Object.keys(data),
          endpoint_used: apiUrl,
          sample: JSON.stringify(data).substring(0, 500)
        }
      });
    }

    console.log(`[LaRuche.ai] 📊 ${rawItems.length} produits trouvés`);

    // ============================================================================
    // TRANSFORMATION
    // ============================================================================
    const products = rawItems
      .filter(item => item)
      .map((item, index) => {
        // ID (multiples variantes)
        const id = String(
          item.product_id || 
          item.item_id || 
          item.id ||
          item.productId ||
          `product_${index}`
        );

        // Titre
        const title = (
          item.product_title || 
          item.title ||
          item.name ||
          item.productTitle ||
          item.subject ||
          'Produit AliExpress'
        ).substring(0, 200);

        // Image
        const image = 
          item.product_main_image_url || 
          item.main_url ||
          item.image_url ||
          item.imageUrl ||
          item.mainImageUrl ||
          item.pic_url ||
          item.image ||
          'https://via.placeholder.com/400';

        // Prix (essayer TOUTES les variantes)
        const costPrice = parseFloat(
          item.app_sale_price || 
          item.target_sale_price || 
          item.sale_price ||
          item.salePrice ||
          item.price ||
          item.originalPrice ||
          item.min_price ||
          item.target_app_sale_price_value ||
          0
        );

        // Shipping
        const shippingCost = parseFloat(
          item.shipping_fee || 
          item.shippingFee ||
          item.logistics_fee ||
          item.freight ||
          0
        );

        // Ventes
        const sales = parseInt(
          item.last_month_num || 
          item.sales_count || 
          item.salesCount ||
          item.volume ||
          item.sales ||
          item.trade_count ||
          0
        );

        // Rating
        const rating = parseFloat(
          item.evaluate_rate || 
          item.evaluateRate ||
          item.rating ||
          item.averageStar ||
          item.average_star ||
          item.star ||
          4.5
        );

        // Lien
        const link = 
          item.product_detail_url || 
          item.productDetailUrl ||
          item.item_url ||
          item.detail_url ||
          item.url ||
          `https://www.aliexpress.com/item/${id}.html`;

        // LaRuche.ai Intelligence
        const suggestedPrice = costPrice * 3;
        const totalCost = costPrice + shippingCost + 10;
        const netProfit = suggestedPrice - totalCost;
        const profitMargin = suggestedPrice > 0 ? (netProfit / suggestedPrice) * 100 : 0;

        let saturationStatus = 'niche';
        let saturationScore = 15;

        if (sales >= 2000) {
          saturationStatus = 'saturated';
          saturationScore = 85;
        } else if (sales >= 500) {
          saturationStatus = 'hot';
          saturationScore = 65;
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
          shipping_optimized: shippingCost <= 5,
          rating: parseFloat(rating.toFixed(1)),
          sales,
          link
        };
      })
      .filter(p => p.cost_price > 0);

    console.log(`[LaRuche.ai] ✅ ${products.length} produits valides`);

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
