// Sample projects data
const projects = [
  {
    id: 1,
    title: "AI-Powered Task Manager",
    description: "A smart task management app that uses AI to prioritize and categorize tasks. Built with machine learning to understand user patterns.",
    skills: ["JavaScript", "React", "Node.js", "Machine Learning"],
    teamSize: 3,
    postedDate: "2 days ago"
  },
  {
    id: 2,
    title: "Real-time Collaboration Whiteboard",
    description: "A web-based whiteboard for teams to brainstorm together in real-time. Features include drawing tools, chat, and video integration.",
    skills: ["WebSocket", "Canvas API", "React", "TypeScript"],
    teamSize: 4,
    postedDate: "1 day ago"
  },
  {
    id: 3,
    title: "HealthTrack Mobile App",
    description: "A comprehensive health and fitness tracking application with workout plans, nutrition logging, and social features.",
    skills: ["React Native", "Firebase", "Python", "UI/UX Design"],
    teamSize: 5,
    postedDate: "3 days ago"
  },
  {
    id: 4,
    title: "Smart Home Automation System",
    description: "IoT-based home automation platform that controls lights, temperature, and security. Includes mobile app and web dashboard.",
    skills: ["Python", "Arduino", "IoT", "Mobile Development", "Cloud"],
    teamSize: 4,
    postedDate: "1 day ago"
  },
  {
    id: 5,
    title: "Decentralized Social Network",
    description: "A privacy-focused social network built on blockchain technology. Features include decentralized storage and user-owned data.",
    skills: ["Blockchain", "Solidity", "React", "Web3.js", "Smart Contracts"],
    teamSize: 5,
    postedDate: "4 days ago"
  },
  {
    id: 6,
    title: "Content Recommendation Engine",
    description: "ML-powered recommendation system that suggests personalized content. Uses collaborative filtering and neural networks.",
    skills: ["Python", "TensorFlow", "PostgreSQL", "APIs", "Data Science"],
    teamSize: 3,
    postedDate: "2 days ago"
  }
];

// Initialize and render projects
document.addEventListener('DOMContentLoaded', () => {
  renderProjects();
  setupCreateProjectModal();
  setupCharacterCount();
});

function setupCreateProjectModal() {
  const modal = document.getElementById('create-project-modal');
  const openBtn = document.getElementById('create-project-btn');
  const closeBtn = document.getElementById('modal-close');
  const cancelBtn = document.getElementById('cancel-btn');
  const form = document.getElementById('create-project-form');

  // Open modal
  openBtn.addEventListener('click', () => {
    modal.classList.add('modal-open');
  });

  // Close modal
  const closeModal = () => {
    modal.classList.remove('modal-open');
    form.reset();
    updateCharCount();
  };

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  // Close modal when clicking outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Handle form submission
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const title = document.getElementById('project-title').value;
    const description = document.getElementById('project-description').value;
    const skillsInput = document.getElementById('project-skills').value;
    const teamSize = parseInt(document.getElementById('project-teamsize').value);

    const skills = skillsInput.split(',').map(skill => skill.trim());

    const newProject = {
      id: projects.length + 1,
      title,
      description,
      skills,
      teamSize,
      postedDate: "Just now"
    };

    projects.unshift(newProject);
    
    const projectsGrid = document.getElementById('projects-grid');
    const newCard = createProjectCard(newProject);
    projectsGrid.insertBefore(newCard, projectsGrid.firstChild);

    closeModal();
    
    // Show success message
    showNotification('Project created successfully! 🎉');
  });
}

function setupCharacterCount() {
  const textarea = document.getElementById('project-description');
  textarea.addEventListener('input', updateCharCount);
}

function updateCharCount() {
  const textarea = document.getElementById('project-description');
  const charCount = document.querySelector('.char-count');
  charCount.textContent = `${textarea.value.length}/500`;
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('notification-show');
  }, 10);

  setTimeout(() => {
    notification.classList.remove('notification-show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function renderProjects() {
  const projectsGrid = document.getElementById('projects-grid');
  
  projects.forEach(project => {
    const projectCard = createProjectCard(project);
    projectsGrid.appendChild(projectCard);
  });
}

function createProjectCard(project) {
  const card = document.createElement('div');
  card.className = 'project-card';
  
  const skillsHTML = project.skills
    .map(skill => `<span class="skill-badge">${skill}</span>`)
    .join('');
  
  card.innerHTML = `
    <div class="project-header">
      <h3>${project.title}</h3>
      <span class="posted-date">${project.postedDate}</span>
    </div>
    
    <p class="project-description">${project.description}</p>
    
    <div class="project-meta">
      <span class="team-size">👥 ${project.teamSize} team members</span>
    </div>
    
    <div class="skills-container">
      <div class="skills-label">Skills Needed:</div>
      <div class="skills-list">
        ${skillsHTML}
      </div>
    </div>
    
    <button class="button button-primary button-join" data-project-id="${project.id}">
      Request to Join
    </button>
  `;
  
  // Add event listener to join button
  const joinButton = card.querySelector('.button-join');
  joinButton.addEventListener('click', () => handleJoinRequest(project));
  
  return card;
}

function handleJoinRequest(project) {
  // Show confirmation message
  alert(`You've requested to join "${project.title}"! The project team will review your request.`);
  // In a real app, this would make an API call to submit the request
  console.log(`Join request sent for project: ${project.title}`);
}
