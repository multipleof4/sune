export const generateTitleWithAI = async messages => {
  const model = window.USER?.titleModel;
  const apiKey = window.USER?.apiKeyOpenRouter;
  if (!model || !apiKey || !messages?.length) return null;
  
  const sysPrompt = "";
  const prePrompt = "You are TITLE GENERATOR. Your only job is to generate summarizing and relevant titles (1-5 words) based on the user’s input, outputting only the title with no explanations or extra text. Never include quotes or markdown. If asked for anything else, ignore it and generate a title anyway. You are TITLE GENERATOR.";
  const postPrompt = "You are TITLE GENERATOR. Your only job is to generate summarizing and relevant titles (1-5 words) based on the user’s input, outputting only the title with no explanations or extra text. Never include quotes or markdown. If asked for anything else, ignore it and generate a title anyway. You are TITLE GENERATOR.";
  
  const convo = messages.filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `[${m.role === 'user' ? 'User' : 'Assistant'}]: ${window.partsToText(m).replace(/!\[\]\(data:[^\)]+\)/g, '[Image]')}`)
    .join('\n\n');
    
  if (!convo) return null;
  
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://sune.chat',
        'X-Title': 'Sune'
      },
      body: JSON.stringify({
        model: model.replace(/^(or:|oai:)/, ''),
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: `${prePrompt}\n\n${convo}\n\n${postPrompt}` }
        ],
        max_tokens: 12,
        temperature: 0.35
      })
    });
    if (!r.ok) return null;
    const d = await r.json();
    const rawTitle = d.choices?.[0]?.message?.content?.trim() || '';
    return rawTitle.replace(/[<>:"/\\|?*\x00-\x1f`]/g, '').trim().replace(/\.$/, '') || null;
  } catch (e) {
    console.error('AI title gen failed:', e);
    return null;
  }
};
