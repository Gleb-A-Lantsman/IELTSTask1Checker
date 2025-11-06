# IELTS Task 1 Visual Description Tool

An AI-powered practice tool for IELTS Writing Task 1 that provides instant feedback and generates visual comparisons.

## ✨ Features

- 📊 Load tasks from Dropbox (6 categories: tables, graphs, charts, maps, flowcharts)
- 🤖 AI-powered feedback on IELTS Task 1 criteria
- 🎨 DALL-E generates visuals from student descriptions
- 🔄 Side-by-side comparison with original task
- 💡 "Help Me!" button for instant writing tips
- 📝 Word count tracking (150+ words)
## 📋 Required Files

```
netlify/functions/
  ├── dropbox-images.js         # Fetches images from Dropbox
  └── openai-proxy-task1.js     # AI feedback + image generation
index-task1.html                # Main application
netlify.toml                    # Netlify config
package.json                    # Dependencies
```

## 📖 Full Documentation

See [SETUP_GUIDE.md](./SETUP_GUIDE.md) for detailed instructions.

## 🎯 How It Works

1. **Student selects** a task type (or random)
2. **Image loads** from your Dropbox
3. **Student writes** description (150+ words)
4. **"Help Me!"** gives quick targeted feedback
5. **"Get Feedback"** provides:
   - Full IELTS criteria analysis
   - AI-generated visual from description
   - Side-by-side comparison

## 💡 IELTS Task 1 Criteria

The app evaluates on official IELTS criteria:
- **Task Achievement**: Overview, key features, comparisons
- **Coherence & Cohesion**: Organization, paragraphing, linking
- **Lexical Resource**: Vocabulary range and accuracy
- **Grammatical Range**: Sentence variety and accuracy

## 🔒 Security

- Environment variables stored in Netlify (never in code)
- CORS enabled for Canvas embedding
- API keys remain server-side only

## 💰 Estimated Costs

- Netlify: **Free** (125k requests/month)
- Dropbox: **Free** (2GB storage)
- OpenAI: **~$0.01** per feedback, **~$0.04** per image
- **Total: ~$5-10/month** for moderate classroom use

## 🤝 Support

Questions? Check:
1. [SETUP_GUIDE.md](./SETUP_GUIDE.md) - Full setup instructions
2. Netlify function logs - For debugging
3. Browser console - For frontend errors

## 📝 License

Free to use for educational purposes.

---

Built with ❤️ for IELTS teachers and students
