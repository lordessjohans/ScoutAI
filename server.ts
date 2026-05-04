import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Routes
  app.post('/api/search', async (req, res) => {
    const { keywords, targetAudience, radius, location } = req.body;
    const apiKey = process.env.SERPER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'SERPER_API_KEY is not configured' });
    }

    try {
      // We'll use Serper's Places API for "near me" searches
      let query = `${targetAudience ? targetAudience + ' ' : ''}${keywords} near ${location || 'me'}`;
      if (radius && !isNaN(Number(radius))) {
        query += ` within ${radius} miles`;
      }
      
      const response = await axios.post('https://google.serper.dev/places', {
        q: query,
      }, {
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json'
        }
      });

      res.json(response.data);
    } catch (error: any) {
      const errMsg = error.response?.data?.message || error.message;
      console.error('Search error:', errMsg);
      res.status(500).json({ error: `Search failed: ${errMsg}` });
    }
  });

  app.post('/api/intent', async (req, res) => {
    const { keywords, targetAudience, location, intentType, platforms, dateRange } = req.body;
    const apiKey = process.env.SERPER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'SERPER_API_KEY is not configured' });
    }

    try {
      const locationQuery = location ? `"${location}"` : '';
      const audienceQuery = targetAudience ? `"${targetAudience}"` : '';
      
      // Determine intent phrases based on type
      let intentPhrases = '("looking for" OR "recommendation" OR "anyone know" OR "need a" OR "ISO" OR "in search of")';
      if (intentType === 'hiring') {
        intentPhrases = '("hiring" OR "wanted" OR "looking to hire" OR "need to hire")';
      } else if (intentType === 'pain') {
        intentPhrases = '("how to fix" OR "broken" OR "struggling with" OR "tired of" OR "help with")';
      }

      // Determine platforms
      let platformQuery = '(site:reddit.com OR site:facebook.com OR site:quora.com OR site:nextdoor.com)';
      if (platforms && platforms.length > 0) {
        platformQuery = `(${platforms.map((p: string) => `site:${p}`).join(' OR ')})`;
      }

      const query = `${audienceQuery} ${keywords} ${locationQuery} ${intentPhrases} ${platformQuery}`;
      
      console.log('Executing Intent Search:', query);

      const payload: any = {
        q: query,
        num: 20
      };

      if (dateRange && dateRange !== 'all') {
        // e.g., dateRange = 'qdr:d' (past day), 'qdr:w' (past week), 'qdr:m' (past month)
        payload.tbs = dateRange;
      } else {
        // default to past 30 days per user request if all is somehow passed, or just normally pass qdr:m
        payload.tbs = 'qdr:m';
      }

      const response = await axios.post('https://google.serper.dev/search', payload, {
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json'
        }
      });

      res.json(response.data);
    } catch (error: any) {
      const errMsg = error.response?.data?.message || error.message;
      console.error('Intent search error:', errMsg);
      res.status(500).json({ error: `Intent search failed: ${errMsg}` });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
