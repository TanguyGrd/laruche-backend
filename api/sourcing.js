// api/sourcing.js
// LaRuche.ai Backend - VERSION AMÉLIORÉE (Tri Pertinence + Plus de Résultats)

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
    // API ALIEXPRESS avec TRI PAR VENTES (meilleure pertinence)
    // ============================================================================
    const apiUrl = `https://aliexpress-true-api.p.rapidapi.com/api/v3/products?keywords=${encodeURIComponent(searchTerm)}&page_no=1&page_size=50&ship_to_country=FR&target_currency=EUR&target_language=FR&sort=ORDERS_DESC`;
    
    console.log(`[LaRuche.ai] 📡 Appel API (tri par ventes)`);

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
    // EXTRACTION
    // ============================================================================
    const rawItems = data?.products?.product || [];

    if (!Array.isArray(rawItems)) {
      console.error(`[LaRuche.ai] ❌ products.product n'est pas un array`);
      return res.status(200).json({
        success: false,
        count: 0,
        products: []
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
    // FILTRE PAR PERTINENCE (titre doit contenir le mot-clé)
    // ============================================================================
    const searchWords = searchTerm.toLowerCase().split(' ');
    
    const filteredItems = rawItems.filter(item => {
      const title = (item.product_title || '').toLowerCase();
      // Le titre doit contenir au moins un des mots recherchés
      return searchWords.some(word => title.includes(word));
    });

    console.log(`[LaRuche.ai] ✅ ${filteredItems.length} produits pertinents`);

    // ============================================================================
    // TRANSFORMATION
    // ============================================================================
    const products = filteredItems
      .filter(item => item && item.product_id)
      .map((item, index) => {
        const id = String(item.product_id);
        const title = (item.product_title || 'Produit').substring(0, 200);
        const image = item.product_main_image_url || 'https://via.placeholder.com/400';
        const costPrice = parseFloat(item.target_sale_price || item.target_app_sale_price || 0);
        const shippingCost = costPrice > 50 ? 0 : 5;
        const sales = parseInt(item.lastest_volume || 0);
        const rating = 4.5;
        const link = item.product_detail_url || `https://fr.aliexpress.com/item/${id}.html`;

        // LaRuche.ai Intelligence
        const AD_COST = 10;
        const MULTIPLIER = 3;

        const suggestedPrice = costPrice * MULTIPLIER;
        const totalCost = costPrice + shippingCost + AD_COST;
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
        } else if (sales >= 100) {
          saturationStatus = 'emerging';
          saturationScore = 40;
        }

        const shippingOptimized = shippingCost <= 5;

        if (index === 0) {
          console.log(`[LaRuche.ai] Premier produit:`, {
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
      .filter(p => p.cost_price > 0 && p.net_profit > 0)
      .slice(0, 40); // Limite à 40 produits

    console.log(`[LaRuche.ai] ✅ ${products.length} produits finaux`);

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
