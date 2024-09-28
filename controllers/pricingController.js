// controllers/pricingController.js
const Pricing = require('../models/Pricing');

// Get the current pricing
exports.getPricing = async (req, res) => {
  try {
    // Fetch the pricing details
    const pricing = await Pricing.findOne();

    if (!pricing) {
      return res.status(404).json({ message: 'Pricing not found' });
    }

    res.json({
      success: true,
      data: pricing,
    });
  } catch (error) {
    console.error('Error fetching pricing:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update the pricing (optional: for admin routes)
exports.updatePricing = async (req, res) => {
  const { modelTrainingCharge, imageGenerationCharge } = req.body;

  try {
    // Fetch the existing pricing or create a new one if not found
    let pricing = await Pricing.findOne();

    if (!pricing) {
      pricing = new Pricing();
    }

    // Update pricing fields
    pricing.modelTrainingCharge = modelTrainingCharge || pricing.modelTrainingCharge;
    pricing.imageGenerationCharge = imageGenerationCharge || pricing.imageGenerationCharge;

    await pricing.save();

    res.json({
      success: true,
      message: 'Pricing updated successfully',
      data: pricing,
    });
  } catch (error) {
    console.error('Error updating pricing:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
