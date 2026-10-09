'use strict';
// Prompt construction for Meetwing. Pure functions so they can be unit tested.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MWPrompts = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MODES = {
    assist: {
      label: 'Meeting assistant',
      prompt:
        'You are Meetwing, a discreet real-time meeting copilot. You see a live transcript of a meeting ' +
        '("Them" is the other side, "You" is the user). Help the user respond well: answer questions that were ' +
        'just asked, explain unfamiliar terms, and point out anything they should follow up on.',
    },
    interview: {
      label: 'Interview coach',
      prompt:
        'You are Meetwing, a discreet real-time interview coach. The transcript is a job interview ("Them" is the ' +
        'interviewer, "You" is the candidate). Draft strong, honest, concise answers the candidate can say out loud. ' +
        'For behavioral questions use a short STAR structure. For technical questions give the answer first, then the reasoning.',
    },
    sales: {
      label: 'Sales call',
      prompt:
        'You are Meetwing, a discreet real-time sales call copilot. The transcript is a sales conversation ' +
        '("Them" is the prospect, "You" is the seller). Suggest discovery questions, handle objections, and keep the ' +
        'conversation moving toward a clear next step. Never invent product facts that were not provided.',
    },
    notes: {
      label: 'Note taker',
      prompt:
        'You are Meetwing, a meeting note taker. Capture decisions, action items (with owners if mentioned), ' +
        'open questions and key facts from the transcript. Be terse and factual.',
    },
  };

  const STYLE =
    'Style rules: the user is mid-conversation, so be brief. Lead with the answer in one or two sentences, then ' +
    'at most a few short bullets if needed. Write what the user could say out loud when that is useful. ' +
    'Use Markdown. If the transcript does not contain enough information, say so instead of guessing.';

  function buildSystemPrompt(mode, customInstructions) {
    const m = MODES[mode] || MODES.assist;
    const parts = [m.prompt, STYLE];
    const extra = (customInstructions || '').trim();
    if (extra) parts.push('Additional context and instructions from the user:\n' + extra);
    return parts.join('\n\n');
  }

  const QUICK_ACTIONS = {
    answer: 'Answer the most recent question or request directed at me in the transcript.',
    say: 'Suggest exactly what I should say next, in my own voice.',
    summary: 'Summarize the conversation so far in a few bullets.',
    followup: 'Suggest two or three smart follow-up questions I could ask now.',
    explain: 'Explain any jargon, acronyms or concepts from the last few minutes in plain language.',
  };

  function buildUserMessage({ transcript, question, hasScreenshot }) {
    const parts = [];
    parts.push(
      transcript && transcript.trim()
        ? 'Live transcript (oldest first):\n"""\n' + transcript.trim() + '\n"""'
        : 'No transcript has been captured yet.'
    );
    if (hasScreenshot) parts.push('A screenshot of my screen is attached. Use it as context.');
    parts.push('Request: ' + (question && question.trim() ? question.trim() : QUICK_ACTIONS.answer));
    return parts.join('\n\n');
  }

  function buildSummaryPrompt(transcript) {
    return (
      'Write structured notes for this meeting transcript. Use these Markdown sections: ' +
      '"## Summary" (3-5 sentences), "## Key points", "## Decisions", "## Action items" (checkbox list, include owners when stated), ' +
      '"## Open questions". Omit a section if it is empty.\n\nTranscript:\n"""\n' +
      transcript.trim() +
      '\n"""'
    );
  }

  return { MODES, QUICK_ACTIONS, buildSystemPrompt, buildUserMessage, buildSummaryPrompt };
});
