/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {GoogleGenAI, Chat} from '@google/genai';

// --- DOM Element Selectors ---
const views = document.querySelectorAll('.view');
const welcomeScreen = document.getElementById('welcome-screen');
const formScreen = document.getElementById('form-screen');
const loadingScreen = document.getElementById('loading-screen');
const resultsScreen = document.getElementById('results-screen');
const startOverButton = document.getElementById('start-over-button');
const serviceButtons = document.querySelectorAll('.service-button');
const analysisForm = document.getElementById('analysis-form');
const formTitle = document.getElementById('form-title');
const formInputs = document.getElementById('form-inputs');
const reportContainer = document.getElementById('report-container');
const followUpForm = document.getElementById('follow-up-form');
const followUpInput = document.getElementById('follow-up-input') as HTMLInputElement;
const followUpMessages = document.getElementById('follow-up-messages');


// --- State ---
let currentView: 'welcome' | 'form' | 'loading' | 'results' = 'welcome';
let chat: Chat | null = null;
let currentAiMessageElement: HTMLElement | null = null;


// --- AI Initialization ---
const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

const systemInstruction = {
    parts: [{
        text: `You are a world-class technical marketing analyst and an expert in the Google Marketing Platform. Your name is "MarTech Analyst". You specialize in Google Analytics 4 (GA4), Google Tag Manager (GTM), and Google Ads. Your goal is to help users diagnose and solve technical issues with their setups.

        When a user provides details for analysis, you must act as if you have performed an automated audit. Your response MUST be a structured report in Markdown format.

        The report should contain the following sections:
        - **Analysis Summary:** A brief overview of the user's goal and the key areas you've "investigated".
        - **Potential Issues Found:** A numbered list of potential problems, misconfigurations, or deviations from best practices. For each issue, explain the potential impact.
        - **Recommendations:** A corresponding numbered list of clear, actionable steps to resolve each issue. Provide code snippets for data layers or scripts where appropriate.
        - **Verification Steps:** A guide on how the user can verify that the fixes are working, for example, using GTM Preview Mode or browser developer tools.

        Maintain a helpful, professional, and authoritative tone. Do not ask for more information in the initial report; base your analysis on the information provided.
        `
    }]
};

// --- View Management ---

/**
 * Hides all views and shows the one specified by the `currentView` state.
 */
function updateView() {
    views.forEach(view => (view as HTMLElement).style.display = 'none');
    document.getElementById(`${currentView}-screen`)!.style.display = 'block';
}

/**
 * Resets the application to its initial state.
 */
function startNewAnalysis() {
    currentView = 'welcome';
    reportContainer!.innerHTML = '';
    followUpMessages!.innerHTML = '';
    chat = null;
    if (analysisForm) (analysisForm as HTMLFormElement).reset();
    if (followUpForm) (followUpForm as HTMLFormElement).reset();
    updateView();
}


// --- Form Generation ---

const formFieldsConfig = {
    'GTM': [
        { label: 'Website URL', id: 'url', type: 'url', placeholder: 'https://example.com', required: true },
        { label: 'GTM Container ID', id: 'gtm-id', type: 'text', placeholder: 'GTM-XXXXXXX', required: true },
        { label: 'Describe your goal or problem', id: 'description', type: 'textarea', placeholder: 'e.g., I am trying to set up a purchase event but it is not firing correctly.', required: true },
    ],
    'GA4': [
        { label: 'Website URL', id: 'url', type: 'url', placeholder: 'https://example.com', required: true },
        { label: 'GA4 Measurement ID', id: 'ga4-id', type: 'text', placeholder: 'G-XXXXXXXXXX', required: true },
        { label: 'Describe your goal or problem', id: 'description', type: 'textarea', placeholder: 'e.g., User engagement metrics seem low, I want to check my event tracking.', required: true },
    ],
    'Ads': [
        { label: 'Website URL', id: 'url', type: 'url', placeholder: 'https://example.com', required: true },
        { label: 'Google Ads Conversion ID / Label', id: 'ads-id', type: 'text', placeholder: 'AW-XXXXXXXXX/YYYYYYYYYYY', required: false },
        { label: 'Describe your goal or problem', id: 'description', type: 'textarea', placeholder: 'e.g., I need to verify that my remarketing tag is active on all pages.', required: true },
    ]
}

/**
 * Displays the form for the selected service.
 * @param {'GTM' | 'GA4' | 'Ads'} service The service to generate the form for.
 */
function showFormForService(service: 'GTM' | 'GA4' | 'Ads') {
    formTitle!.textContent = `Analyze ${service} Setup`;
    formInputs!.innerHTML = '';
    const fields = formFieldsConfig[service];

    fields.forEach(field => {
        const label = document.createElement('label');
        label.setAttribute('for', field.id);
        label.textContent = field.label;

        let input;
        if (field.type === 'textarea') {
            input = document.createElement('textarea');
            (input as HTMLTextAreaElement).rows = 4;
        } else {
            input = document.createElement('input');
            (input as HTMLInputElement).type = field.type;
        }

        input.id = field.id;
        input.name = field.id;
        input.placeholder = field.placeholder;
        input.required = field.required;

        formInputs!.appendChild(label);
        formInputs!.appendChild(input);
    });

    currentView = 'form';
    updateView();
}

// --- Report & Chat Functions ---

/**
 * Renders markdown text as HTML in the report container.
 * @param {string} markdown The markdown text to render.
 */
function renderReport(markdown: string) {
    let html = markdown
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/^\* (.*$)/gim, '<ul><li>$1</li></ul>') // Basic list support
        .replace(/<\/ul>\n<ul>/gim, '')
        .replace(/```javascript\n([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')
        .replace(/```\n([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')
        .replace(/`([^`]+)`/gim, '<code>$1</code>')
        .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');

    reportContainer!.innerHTML = html;
}

/**
 * Adds a message to the follow-up chat UI.
 * @param {string} text The message text.
 * @param {'user' | 'ai' | 'error'} sender The sender.
 */
function addFollowUpMessage(text: string, sender: 'user' | 'ai' | 'error') {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);
    const p = document.createElement('p');
    p.innerHTML = text; // Use innerHTML to render line breaks from AI
    messageElement.appendChild(p);

    if (sender === 'ai') {
        const cursor = document.createElement('span');
        cursor.classList.add('cursor');
        p.appendChild(cursor);
        currentAiMessageElement = p;
    } else {
        finalizeAiMessage();
    }

    followUpMessages!.appendChild(messageElement);
    followUpMessages!.scrollTop = followUpMessages!.scrollHeight;
}

function appendToCurrentAiMessage(text: string) {
    if (currentAiMessageElement) {
        currentAiMessageElement.querySelector('.cursor')?.remove();
        currentAiMessageElement.innerHTML += text;
        const newCursor = document.createElement('span');
        newCursor.classList.add('cursor');
        currentAiMessageElement.appendChild(newCursor);
    }
}

function finalizeAiMessage() {
    if (currentAiMessageElement) {
        currentAiMessageElement.querySelector('.cursor')?.remove();
        currentAiMessageElement = null;
    }
}


// --- Event Handlers ---

startOverButton?.addEventListener('click', startNewAnalysis);

serviceButtons.forEach(button => {
    button.addEventListener('click', () => {
        const service = button.getAttribute('data-service') as 'GTM' | 'GA4' | 'Ads';
        showFormForService(service);
    });
});

analysisForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    currentView = 'loading';
    updateView();

    const formData = new FormData(analysisForm as HTMLFormElement);
    const formProps = Object.fromEntries(formData);

    const prompt = `
        Service to Analyze: ${formTitle!.textContent?.replace('Analyze ', '').replace(' Setup', '')}
        Details:
        ${Object.entries(formProps).map(([key, value]) => `- ${key}: ${value}`).join('\n')}
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { systemInstruction },
        });

        renderReport(response.text);

        // Initialize follow-up chat
        chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: {
                    parts: [{ text: `You are a helpful assistant continuing the conversation about a MarTech analysis report you just provided. The user will ask follow-up questions. Be concise and helpful.` }]
                }
            }
        });
        // Seed the chat history with the report context
        await chat.sendMessage({ message: `The user provided these details:\n${prompt}\n\nAnd I generated this report:\n${response.text}\n\nNow, I will answer the user's follow-up questions.` });


        currentView = 'results';
        updateView();
    } catch (error) {
        console.error("Analysis failed:", error);
        reportContainer!.innerHTML = `<div class="error-message"><p>Sorry, an error occurred during the analysis. Please try again.</p></div>`;
        currentView = 'results';
        updateView();
    }
});

followUpForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = followUpInput.value.trim();

    if (message && chat) {
        addFollowUpMessage(message, 'user');
        followUpInput.value = '';
        addFollowUpMessage('', 'ai'); // Empty bubble for streaming

        try {
            const responseStream = await chat.sendMessageStream({ message });
            for await (const chunk of responseStream) {
                appendToCurrentAiMessage(chunk.text.replace(/\n/g, '<br>'));
            }
        } catch (error) {
            console.error("Follow-up chat error:", error);
            addFollowUpMessage("Sorry, I encountered an error. Please try asking again.", 'error');
        } finally {
            finalizeAiMessage();
        }
    }
});


// --- Initial Load ---
updateView();
