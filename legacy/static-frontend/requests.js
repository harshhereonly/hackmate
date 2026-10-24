// Sample join requests data
let requests = [
  {
    id: 1,
    userName: "Alex Johnson",
    userImage: "👨‍💻",
    projectTitle: "AI-Powered Task Manager",
    projectId: 1,
    message: "I have 3 years of React experience and would love to work on this project. I'm particularly interested in the AI/ML integration part.",
    skills: ["JavaScript", "React", "Machine Learning"],
    experience: "Intermediate",
    requestDate: "2 hours ago",
    status: "pending"
  },
  {
    id: 2,
    userName: "Sarah Williams",
    userImage: "👩‍💼",
    projectTitle: "Real-time Collaboration Whiteboard",
    projectId: 2,
    message: "Full-stack developer with WebSocket experience. Ready to start immediately!",
    skills: ["WebSocket", "React", "Node.js"],
    experience: "Advanced",
    requestDate: "1 day ago",
    status: "pending"
  },
  {
    id: 3,
    userName: "Mike Chen",
    userImage: "👨‍🎓",
    projectTitle: "HealthTrack Mobile App",
    projectId: 3,
    message: "Beginner in React Native but very motivated. I'm ready to learn and contribute!",
    skills: ["React Native", "JavaScript"],
    experience: "Beginner",
    requestDate: "3 hours ago",
    status: "pending"
  },
  {
    id: 4,
    userName: "Emma Davis",
    userImage: "👩‍💻",
    projectTitle: "Smart Home Automation System",
    projectId: 4,
    message: "IoT specialist with 5 years of experience. Let's build something amazing!",
    skills: ["Python", "IoT", "Cloud"],
    experience: "Advanced",
    requestDate: "5 days ago",
    status: "accepted"
  },
  {
    id: 5,
    userName: "James Smith",
    userImage: "👨‍💻",
    projectTitle: "Decentralized Social Network",
    projectId: 5,
    message: "Blockchain enthusiast but lacking specific Solidity experience.",
    skills: ["Web3.js", "JavaScript"],
    experience: "Intermediate",
    requestDate: "4 days ago",
    status: "rejected"
  }
];

let currentFilter = 'pending';

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  renderRequests(currentFilter);
  setupTabFilters();
});

function setupTabFilters() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      tabBtns.forEach(b => b.classList.remove('tab-active'));
      e.target.classList.add('tab-active');
      currentFilter = e.target.dataset.filter;
      renderRequests(currentFilter);
    });
  });
}

function renderRequests(filter) {
  const container = document.getElementById('requests-container');
  const emptyState = document.getElementById('empty-state');
  
  const filteredRequests = requests.filter(req => req.status === filter);
  
  container.innerHTML = '';
  
  if (filteredRequests.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }
  
  container.style.display = 'grid';
  emptyState.style.display = 'none';
  
  filteredRequests.forEach(request => {
    const card = createRequestCard(request);
    container.appendChild(card);
  });
}

function createRequestCard(request) {
  const card = document.createElement('div');
  card.className = 'request-card';
  
  const skillsHTML = request.skills
    .map(skill => `<span class="skill-badge-small">${skill}</span>`)
    .join('');
  
  let actionButtons = '';
  if (request.status === 'pending') {
    actionButtons = `
      <div class="request-actions">
        <button class="button button-primary button-accept" data-request-id="${request.id}">
          ✓ Accept
        </button>
        <button class="button button-secondary button-reject" data-request-id="${request.id}">
          ✕ Reject
        </button>
      </div>
    `;
  } else {
    const statusClass = request.status === 'accepted' ? 'status-accepted' : 'status-rejected';
    const statusText = request.status === 'accepted' ? '✓ Accepted' : '✕ Rejected';
    actionButtons = `
      <div class="request-status ${statusClass}">${statusText}</div>
    `;
  }
  
  card.innerHTML = `
    <div class="request-header">
      <div class="user-info">
        <div class="user-avatar">${request.userImage}</div>
        <div class="user-details">
          <h3>${request.userName}</h3>
          <p class="experience-level">${request.experience} • ${request.requestDate}</p>
        </div>
      </div>
      <a href="projects.html" class="project-link" title="View project">${request.projectTitle}</a>
    </div>
    
    <div class="request-message">
      <p>"${request.message}"</p>
    </div>
    
    <div class="request-skills">
      ${skillsHTML}
    </div>
    
    ${actionButtons}
  `;
  
  // Add event listeners
  const acceptBtn = card.querySelector('.button-accept');
  const rejectBtn = card.querySelector('.button-reject');
  
  if (acceptBtn) {
    acceptBtn.addEventListener('click', () => handleAcceptRequest(request.id, card));
  }
  if (rejectBtn) {
    rejectBtn.addEventListener('click', () => handleRejectRequest(request.id, card));
  }
  
  return card;
}

function handleAcceptRequest(requestId, cardElement) {
  const request = requests.find(r => r.id === requestId);
  request.status = 'accepted';
  
  showNotification(`✓ Request from ${request.userName} accepted!`);
  
  if (currentFilter === 'pending') {
    cardElement.remove();
    const container = document.getElementById('requests-container');
    if (container.children.length === 0) {
      container.style.display = 'none';
      document.getElementById('empty-state').style.display = 'block';
    }
  } else {
    renderRequests(currentFilter);
  }
}

function handleRejectRequest(requestId, cardElement) {
  const request = requests.find(r => r.id === requestId);
  
  if (confirm(`Are you sure you want to reject ${request.userName}'s request?`)) {
    request.status = 'rejected';
    
    showNotification(`✕ Request from ${request.userName} rejected`);
    
    if (currentFilter === 'pending') {
      cardElement.remove();
      const container = document.getElementById('requests-container');
      if (container.children.length === 0) {
        container.style.display = 'none';
        document.getElementById('empty-state').style.display = 'block';
      }
    } else {
      renderRequests(currentFilter);
    }
  }
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
