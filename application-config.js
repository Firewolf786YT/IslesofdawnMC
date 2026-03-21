(() => {
  const APPLICATION_DEFINITIONS = [
    {
      id: 'support-team',
      title: 'Support Team',
      emoji: '🛡️',
      section: 'main',
      description: 'Help players with questions, moderate chat, and maintain a positive community environment.',
      questions: [
        'Why do you want to join the Support Team at IslesOfDawnMC?',
        'How would you assist a frustrated player who reports an issue in chat?',
        'How do you handle rule enforcement while staying respectful and calm?',
        'What would you do to improve day-to-day player support on the server?',
      ],
    },
    {
      id: 'dev-team',
      title: 'Development Team',
      emoji: '⚙️',
      section: 'main',
      description: 'Build plugins, design features, and drive the technical side of the IslesOfDawnMC experience.',
      questions: [
        'Why do you want to join the Development Team at IslesOfDawnMC?',
        'What development experience (plugins, scripts, tools, configs) do you have?',
        'Describe how you would debug a reported issue from players or staff.',
        'What system or feature would you build to improve the server long-term?',
      ],
    },
    {
      id: 'qa-team',
      title: 'Quality Assurance Team',
      emoji: '🔍',
      section: 'main',
      description: 'Test new content and updates to ensure a polished, bug-free experience for every player.',
      questions: [
        'Why do you want to join the QA Team at IslesOfDawnMC?',
        'How do you test features and document bugs clearly for developers?',
        'How would you prioritize critical bugs versus minor issues?',
        'What QA process would you introduce to improve release quality?',
      ],
    },
    {
      id: 'build-team',
      title: 'Build Team',
      emoji: '🏗️',
      section: 'additional',
      description: 'Design and create immersive server builds, hubs, and themed environments.',
      questions: [
        'Why do you want to join the Build Team at IslesOfDawnMC?',
        'What building styles/themes are you strongest with, and why?',
        'How would you collaborate with other builders on a large project?',
        'What build project would you propose to improve the player experience?',
      ],
    },
    {
      id: 'media-team',
      title: 'Media Team',
      emoji: '🎬',
      section: 'additional',
      description: 'Create graphics, trailers, and social media assets to showcase IslesOfDawnMC.',
      questions: [
        'Why do you want to join the Media Team at IslesOfDawnMC?',
        'What media skills do you have (editing, design, trailers, social posts)?',
        'How would you plan and deliver content on a consistent schedule?',
        'What media campaign would you run to grow server visibility?',
      ],
    },
    {
      id: 'event-team',
      title: 'Event Team',
      emoji: '🎉',
      section: 'additional',
      description: 'Plan and host community events that keep gameplay fresh and exciting.',
      questions: [
        'Why do you want to join the Event Team at IslesOfDawnMC?',
        'Describe an event idea and how you would organize it from start to finish.',
        'How would you handle disputes, confusion, or rule-breaking during an event?',
        'What would you do to make events more engaging and fair for all players?',
      ],
    },
    {
      id: 'content-creator',
      title: 'Content Creator',
      emoji: '📹',
      section: 'additional',
      description: 'Produce streams or videos featuring the server and help grow the community.',
      questions: [
        'Why do you want to apply as a Content Creator for IslesOfDawnMC?',
        'What type of content do you create and what tools/workflow do you use?',
        'How would you represent the server brand positively in public content?',
        'What content series would you launch first to highlight server features?',
      ],
    },
  ];

  const cloneDefinition = (definition) => ({
    ...definition,
    questions: Array.isArray(definition.questions) ? [...definition.questions] : [],
  });

  const getApplicationDefinitions = () => APPLICATION_DEFINITIONS.map(cloneDefinition);

  const getApplicationById = (applicationId) => {
    const id = String(applicationId || '').trim();
    if (!id) return null;
    const found = APPLICATION_DEFINITIONS.find((definition) => definition.id === id);
    return found ? cloneDefinition(found) : null;
  };

  const getApplicationQuestions = (applicationId) => {
    const found = getApplicationById(applicationId);
    return Array.isArray(found?.questions) ? [...found.questions] : [];
  };

  window.APPLICATION_DEFINITIONS = getApplicationDefinitions();
  window.getApplicationDefinitions = getApplicationDefinitions;
  window.getApplicationById = getApplicationById;
  window.getApplicationQuestions = getApplicationQuestions;
})();
