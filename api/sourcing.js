export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const keywords = req.query.keywords || 'laptop';
    
    const apiUrl = `https://aliexpress-true-api.p.rapidapi.com/api/v3/products?keywords=${encodeURIComponent(keywords)}&page_no=1&page_size=40&ship_to_country=FR&target_currency=EUR&target_language=FR&sort=SALE_PRICE_ASC`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'aliexpress-true-api.p.rapidapi.com'
      }
    });

    if (!response.ok) {
      return res.status(200).json({
        success: false,
        count: 0,
        products: [],
        error: `API returned ${response.status}`
      });
    }

    const data = await response.json();
    const rawItems = data?.products?.product || [];

    const products = rawItems
      .filter(item => item && item.product_id)
      .map(item => {
        const costPrice = parseFloat(item.target_sale_price || 0);
        const shippingCost = costPrice > 50 ? 0 : 5;
        const sales = parseInt(item.lastest_volume || 0);
        
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
          id: String(item.product_id),
          title: (item.product_title || 'Produit').substring(0, 200),
          image: item.product_main_image_url || 'https://via.placeholder.com/400',
          price: costPrice.toFixed(2) + '€',
          cost_price: costPrice,
          shipping_cost: shippingCost,
          suggested_price: parseFloat(suggestedPrice.toFixed(2)),
          total_cost: parseFloat(totalCost.toFixed(2)),
          net_profit: parseFloat(netProfit.toFixed(2)),
          profit_margin: parseFloat(profitMargin.toFixed(2)),
          saturation_status: saturationStatus,
          saturation_score: saturationScore,
          shipping_optimized: shippingCost <= 5,
          rating: 4.5,
          sales: sales,
          link: item.product_detail_url || `https://fr.aliexpress.com/item/${item.product_id}.html`
        };
      })
      .filter(p => p.cost_price > 0);

    return res.status(200).json({
      success: true,
      count: products.length,
      products: products
    });

  } catch (error) {
    return res.status(200).json({
      success: false,
      count: 0,
      products: [],
      error: error.message
    });
  }
}
