const Collection = require('../models/Collection');

exports.addToCollection = async (req, res) => {
  try {
    const { lesson_id, video_url, title } = req.body;
    const user_id = req.user?.id;

    if (!user_id) return res.status(401).json({ error: 'User not authenticated' });
    if (!lesson_id || !video_url || !title) return res.status(400).json({ error: 'Missing required fields' });

    const collection = new Collection({
      user_id,
      lesson_id,
      video_url,
      title,
    });
    await collection.save();

    res.status(201).json({ message: 'Added to collection successfully', collection });
  } catch (error) {
    console.error('Error adding to collection:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getCollection = async (req, res) => {
  try {
    const user_id = req.user?.id;
    if (!user_id) return res.status(401).json({ error: 'User not authenticated' });

    const collections = await Collection.find({ user_id }).populate('lesson_id');
    res.status(200).json(collections);
  } catch (error) {
    console.error('Error fetching collection:', error);
    res.status(500).json({ error: error.message });
  }
};
exports.deleteFromCollection = async (req, res) => {
  try {
    const { collectionId } = req.params;
    const user_id = req.user?.id;

    if (!user_id) return res.status(401).json({ error: 'User not authenticated' });
    if (!collectionId) return res.status(400).json({ error: 'Collection ID is required' });

    const collection = await Collection.findOneAndDelete({
      _id: collectionId,
      user_id,
    });

    if (!collection) {
      return res.status(404).json({ error: 'Collection item not found or not authorized' });
    }

    res.status(200).json({ message: 'Removed from collection successfully' });
  } catch (error) {
    console.error('Error deleting from collection:', error);
    res.status(500).json({ error: error.message });
  }
};