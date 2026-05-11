export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    brandName,
    brandPronunciation,
    introduction,
    personalExperience,
    callToAction,
    doNotSay,
  } = req.body;

  if (!brandName) {
    return res.status(400).json({ error: 'Brand name is required' });
  }

  const token = process.env.NOTION_TOKEN;
  const parentPageId = '33cbb607-4fe3-8182-9009-fa0f2cd5e411';

  const content = [
    brandPronunciation ? `## Brand Pronunciation\n${brandPronunciation}\n` : '',
    introduction ? `## Introduction & Thought Starters\n${introduction}\n` : '',
    personalExperience ? `## Personal Experience\n${personalExperience}\n` : '',
    callToAction ? `## Call to Action *(read verbatim)*\n${callToAction}\n` : '',
    doNotSay ? `## Don't Say\n${doNotSay}\n` : '',
  ].filter(Boolean).join('\n');

  try {
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { page_id: parentPageId },
        icon: { type: 'emoji', emoji: '🎙️' },
        properties: {
          title: {
            title: [{ text: { content: `${brandName} — Creative Brief` } }],
          },
        },
        children: parseMarkdownToBlocks(content),
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Notion error:', err);
      return res.status(500).json({ error: 'Failed to create Notion page', detail: err });
    }

    const page = await response.json();
    return res.status(200).json({ success: true, url: page.url });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

function parseMarkdownToBlocks(markdown) {
  const blocks = [];
  const lines = markdown.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;

    if (line.startsWith('## ')) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: line.replace('## ', '') } }],
        },
      });
    } else if (line.startsWith('- ')) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{ type: 'text', text: { content: line.replace('- ', '') } }],
        },
      });
    } else {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: line } }],
        },
      });
    }
  }

  return blocks;
}
