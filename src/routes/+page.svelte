<script>
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	
	// API base URL - adjust this to match your server
	const API_BASE_URL = 'http://localhost:3000/api';
	
	// State for users
	let users = [];
	let isLoading = true;
	let error = null;
	
	// State for the chatbot
	let isChatOpen = false;
	let messages = [];
	let currentMessage = '';
	
	// UI state
	let searchTerm = '';
	let currentPage = 1;
	const usersPerPage = 5;
	let selectedRows = [];
	let showDeleteConfirmation = false;
	let userToDelete = null;
	
	// Add User form state
	let showAddUserForm = false;
	let newUser = {
	  name: '',
	  email: '',
	  date_of_birth: '',
	  phone_number: ''
	};
	let isAddingUser = false;
	let addUserError = null;
	
	// Summary state
	let showSummaryModal = false;
	let summaryPrompt = "Analyze these users and provide insights about age distribution, contact information patterns, and any notable trends.";
	let generatedSummary = "";
	let isGeneratingSummary = false;
	let summaryError = null;
	
	// Fetch users from the database
	async function fetchUsers() {
	  isLoading = true;
	  error = null;
	  
	  try {
		const response = await fetch(`${API_BASE_URL}/users`);
		if (!response.ok) {
		  throw new Error(`Failed to fetch users: ${response.statusText}`);
		}
		
		users = await response.json();
		
		// Format date of birth for display
		users = users.map(user => ({
		  ...user,
		  formatted_dob: user.date_of_birth ? new Date(user.date_of_birth).toLocaleDateString() : 'Not provided',
		  dateCreated: new Date(user.created_at).toLocaleDateString()
		}));
	  } catch (err) {
		console.error('Error fetching users:', err);
		error = err.message;
	  } finally {
		isLoading = false;
	  }
	}
	
	// Add a new user
	async function addUser() {
	  if (!newUser.name || !newUser.email) {
		addUserError = 'Name and email are required';
		return;
	  }
	  
	  isAddingUser = true;
	  addUserError = null;
	  
	  try {
		const response = await fetch(`${API_BASE_URL}/users`, {
		  method: 'POST',
		  headers: {
			'Content-Type': 'application/json'
		  },
		  body: JSON.stringify(newUser)
		});
		
		const data = await response.json();
		
		if (!response.ok) {
		  throw new Error(data.error || 'Failed to add user');
		}
		
		// Add the new user to the local state
		await fetchUsers();
		
		// Reset the form and close it
		resetAddUserForm();
		closeAddUserForm();
		
		// Add a success message to chat
		messages = [...messages, { 
		  text: `User ${newUser.name} has been successfully added.`,
		  sender: 'ai'
		}];
	  } catch (err) {
		console.error('Error adding user:', err);
		addUserError = err.message;
	  } finally {
		isAddingUser = false;
	  }
	}
	
	// Replace the generateSummary function with this updated version
	// that only uses selected users
	async function generateSummary() {
	  if (!summaryPrompt) {
		summaryError = 'Please enter a prompt for the summary';
		return;
	  }
	  
	  // Use selectedRows instead of all users
	  if (selectedRows.length === 0) {
		summaryError = 'Please select at least one user to generate a summary';
		return;
	  }
	  
	  isGeneratingSummary = true;
	  summaryError = null;
	  generatedSummary = "";
	  
	  try {
		// Prepare only the selected user data for the summary
		const userData = selectedRows.map(user => ({
		  name: user.name,
		  email: user.email,
		  date_of_birth: user.date_of_birth,
		  phone_number: user.phone_number || 'Not provided'
		}));
		
		// Call the API to generate summary with Ollama gemma:2b
		const response = await fetch(`${API_BASE_URL}/generate-summary`, {
		  method: 'POST',
		  headers: {
			'Content-Type': 'application/json'
		  },
		  body: JSON.stringify({
			model: 'gemma:2b',
			prompt: summaryPrompt,
			data: userData
		  })
		});
		
		if (!response.ok) {
		  const errorData = await response.json();
		  throw new Error(errorData.error || 'Failed to generate summary');
		}
		
		const data = await response.json();
		generatedSummary = data.summary;
		
		// Add a success message to chat
		messages = [...messages, { 
		  text: `Summary generated successfully for ${selectedRows.length} selected users.`,
		  sender: 'ai'
		}];
	  } catch (err) {
		console.error('Error generating summary:', err);
		summaryError = err.message;
	  } finally {
		isGeneratingSummary = false;
	  }
	}
	
	// Show summary modal
	function showSummaryInterface() {
	  showSummaryModal = true;
	}
	
	// Close summary modal
	function closeSummaryModal() {
	  showSummaryModal = false;
	}
	
	// Show add user form
	function showAddUserModal() {
	  showAddUserForm = true;
	}
	
	// Close add user form
	function closeAddUserForm() {
	  showAddUserForm = false;
	}
	
	// Reset add user form
	function resetAddUserForm() {
	  newUser = {
		name: '',
		email: '',
		date_of_birth: '',
		phone_number: ''
	  };
	  addUserError = null;
	}
	
	// Delete a user
	async function deleteUser(userId) {
	  try {
		const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
		  method: 'DELETE'
		});
		
		if (!response.ok) {
		  throw new Error(`Failed to delete user: ${response.statusText}`);
		}
		
		// Remove the user from the local state
		users = users.filter(user => user.id !== userId);
		
		// Clear the user from selected rows if present
		selectedRows = selectedRows.filter(user => user.id !== userId);
		
		// Close the confirmation dialog
		closeDeleteConfirmation();
		
		// Add a success message to chat
		messages = [...messages, { 
		  text: `User has been successfully deleted.`,
		  sender: 'ai'
		}];
		
	  } catch (err) {
		console.error('Error deleting user:', err);
		
		// Add an error message to chat
		messages = [...messages, { 
		  text: `Error deleting user: ${err.message}`,
		  sender: 'ai'
		}];
	  }
	}
	
	// Show delete confirmation dialog
	function showDeleteConfirmationDialog(user) {
	  userToDelete = user;
	  showDeleteConfirmation = true;
	}
	
	// Close delete confirmation dialog
	function closeDeleteConfirmation() {
	  showDeleteConfirmation = false;
	  userToDelete = null;
	}
	
	// Confirm user deletion
	function confirmDeleteUser() {
	  if (userToDelete) {
		deleteUser(userToDelete.id);
	  }
	}
	
	// Function to toggle chat
	function toggleChat() {
	  isChatOpen = !isChatOpen;
	}
	
	// Function to send a message
	async function sendMessage() {
	  if (currentMessage.trim()) {
		messages = [...messages, { text: currentMessage, sender: 'user' }];
		const messageToSend = currentMessage;
		currentMessage = '';
		
		// Process commands
		if (messageToSend.startsWith('/')) {
		  processCommand(messageToSend);
		} else {
		  // Send message to AI
		  try {
			const response = await fetch(`${API_BASE_URL}/chat`, {
			  method: 'POST',
			  headers: {
				'Content-Type': 'application/json'
			  },
			  body: JSON.stringify({ message: messageToSend })
			});
			
			if (!response.ok) {
			  throw new Error('Failed to get AI response');
			}
			
			const data = await response.json();
			messages = [...messages, { 
			  text: data.response || "I'm not sure how to respond to that.",
			  sender: 'ai'
			}];
		  } catch (err) {
			console.error('Error getting AI response:', err);
			messages = [...messages, { 
			  text: "Sorry, I couldn't process your request. Please try again.",
			  sender: 'ai'
			}];
		  }
		}
	  }
	}
	
	// Handle Enter key in chat input
	function handleKeydown(event) {
	  if (event.key === 'Enter' && !event.shiftKey) {
		event.preventDefault();
		sendMessage();
	  }
	}
	
	function processCommand(command) {
	  switch (command) {
		case '/help':
		  messages = [...messages, { text: `Available commands: /help, /clear, /users, /user [name]`, sender: 'ai' }];
		  break;
		case '/clear':
		  messages = [];
		  break;
		case '/users':
		  if (users.length > 0) {
			const userList = users.map(user => user.name).join(', ');
			messages = [...messages, { text: `Users: ${userList}`, sender: 'ai' }];
		  } else {
			messages = [...messages, { text: `No users found.`, sender: 'ai' }];
		  }
		  break;
		default:
		  if (command.startsWith('/user')) {
			const userName = command.substring(6).trim();
			const user = users.find(u => u.name.toLowerCase() === userName.toLowerCase());
			if (user) {
			  messages = [...messages, { text: `User details: Name: ${user.name}, Email: ${user.email}, Date of Birth: ${user.formatted_dob}, Phone: ${user.phone_number || 'Not provided'}`, sender: 'ai' }];
			} else {
			  messages = [...messages, { text: `User ${userName} not found.`, sender: 'ai' }];
			}
		  } else {
			messages = [...messages, { text: `Unknown command. Type /help for available commands.`, sender: 'ai' }];
		  }
	  }
	}
	
	// Toggle row selection
	function toggleRowSelection(user) {
	  if (selectedRows.includes(user)) {
		selectedRows = selectedRows.filter(u => u !== user);
	  } else {
		selectedRows = [...selectedRows, user];
	  }
	}
	
	function handleSearch(event) {
	  searchTerm = event.target.value;
	  currentPage = 1; // Reset to first page on search
	}
	
	$: filteredUsers = users.filter(user => {
	  const searchRegex = new RegExp(searchTerm, 'i');
	  return searchRegex.test(user.name) || searchRegex.test(user.email) || searchRegex.test(user.phone_number || '');
	});
	
	$: totalPages = Math.ceil(filteredUsers.length / usersPerPage);
	$: paginatedUsers = filteredUsers.slice((currentPage - 1) * usersPerPage, currentPage * usersPerPage);
	
	function goToPreviousPage() {
	  if (currentPage > 1) {
		currentPage--;
	  }
	}
	
	function goToNextPage() {
	  if (currentPage < totalPages) {
		currentPage++;
	  }
	}
	
	function goToPage(page) {
	  if (page >= 1 && page <= totalPages) {
		currentPage = page;
	  }
	}
	
	onMount(() => {
	  // Fetch users when component mounts
	  fetchUsers();
	});
  </script>
  
  <style>
	@keyframes spin {
	  from {
		transform: rotate(0deg);
	  }
	  to {
		transform: rotate(360deg);
	  }
	}
  </style>
  
  <div style="display: flex; height: 100vh; width: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb;">
	<!-- Left Sidebar -->
	<div style="width: 250px; background-color: white; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column;">
	  <!-- Dashboard Header -->
	  <div style="padding: 1.5rem; border-bottom: 1px solid #e5e7eb;">
		<div style="font-size: 1.25rem; font-weight: 500; color: #0d9488;">Dashboard</div>
	  </div>
	  
	  <!-- Sidebar Menu -->
	  <nav style="padding: 1.5rem;">
		<div style="font-weight: 500; color: #0d9488; display: flex; align-items: center; margin-bottom: 1rem;">
		  <svg style="margin-right: 0.75rem;" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2"/>
			<rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2"/>
			<rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2"/>
			<rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2"/>
		  </svg>
		  Overview
		</div>
		
		<div style="font-weight: 400; color: #6b7280; display: flex; align-items: center; margin-bottom: 1rem;">
			<path d="M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			<path d="M12 14C8.13401 14 5 17.134 5 21H19C19 17.134 15.866 14 12 14Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
		</div>
		
		<div style="font-weight: 400; color: #6b7280; display: flex; align-items: center; margin-bottom: 1rem;">
			<path d="M8 18V5M8 18L3 18M8 18L13 18M21 18H13M13 18V13M13 13H18L21 10M13 13V5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
		</div>
		
		<div style="font-weight: 400; color: #6b7280; display: flex; align-items: center;">
			<path d="M10.325 4.317C10.751 2.561 13.249 2.561 13.675 4.317C13.7389 4.5808 13.8642 4.82578 14.0407 5.032C14.2172 5.23822 14.4399 5.39985 14.6907 5.50375C14.9414 5.60764 15.2132 5.65085 15.4838 5.62987C15.7544 5.60889 16.0162 5.5243 16.248 5.383C17.791 4.443 19.558 6.209 18.618 7.753C18.4769 7.98466 18.3924 8.24634 18.3715 8.51677C18.3506 8.78721 18.3938 9.05877 18.4975 9.30938C18.6013 9.55999 18.7627 9.78258 18.9687 9.95905C19.1747 10.1355 19.4194 10.2609 19.683 10.325C21.439 10.751 21.439 13.249 19.683 13.675C19.4192 13.7389 19.1742 13.8642 18.968 14.0407C18.7618 14.2172 18.6001 14.4399 18.4963 14.6907C18.3924 14.9414 18.3491 15.2132 18.3701 15.4838C18.3911 15.7544 18.4757 16.0162 18.617 16.248C19.557 17.791 17.791 19.558 16.247 18.618C16.0153 18.4769 15.7537 18.3924 15.4832 18.3715C15.2128 18.3506 14.9412 18.3938 14.6906 18.4975C14.44 18.6013 14.2174 18.7627 14.0409 18.9687C13.8645 19.1747 13.7391 19.4194 13.675 19.683C13.249 21.439 10.751 21.439 10.325 19.683C10.2611 19.4192 10.1358 19.1742 9.95929 18.968C9.7828 18.7618 9.56011 18.6001 9.30935 18.4963C9.05859 18.3924 8.78683 18.3491 8.51621 18.3701C8.24559 18.3911 7.98375 18.4757 7.752 18.617C6.209 19.557 4.442 17.791 5.382 16.247C5.5231 16.0153 5.60755 15.7537 5.62848 15.4832C5.64942 15.2128 5.60624 14.9412 5.50247 14.6906C5.3987 14.44 5.23726 14.2174 5.03127 14.0409C4.82529 13.8645 4.58056 13.7391 4.317 13.675C2.561 13.249 2.561 10.751 4.317 10.325C4.5808 10.2611 4.82578 10.1358 5.032 9.95929C5.23822 9.7828 5.39985 9.56011 5.50375 9.30935C5.60764 9.05859 5.65085 8.78683 5.62987 8.51621C5.60889 8.24559 5.5243 7.98375 5.383 7.752C4.443 6.209 6.209 4.442 7.753 5.382C8.753 5.99 10.049 5.452 10.325 4.317Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			<path d="M15 12C15 13.6569 13.6569 15 12 15C10.3431 15 9 13.6569 9 12C9 10.3431 10.3431 9 12 9C13.6569 9 15 10.3431 15 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
		</div>
	  </nav>
	</div>
	
	<!-- Main Content -->
	<div style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
	  <!-- Page Header -->
	  <div style="padding: 1.5rem 2rem; background-color: white; border-bottom: 1px solid #e5e7eb;">
		<h1 style="font-size: 1.5rem; font-weight: 600; color: #111827; margin: 0;">User Management</h1>
		<p style="margin-top: 0.5rem; font-size: 0.875rem; color: #6b7280;">Manage your users and their contact information here.</p>
	  </div>
	  
	  <!-- Content Area -->
	  <div style="flex: 1; padding: 1.5rem 2rem; overflow: auto;">
		<!-- User Table -->
		<div style="background-color: white; border-radius: 0.5rem; border: 1px solid #e5e7eb; overflow: hidden; display: flex; flex-direction: column;">
		  <div style="padding: 1rem 1.5rem; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
			<h2 style="font-size: 1rem; font-weight: 500; color: #111827; margin: 0;">Users</h2>
			<div style="display: flex; gap: 0.5rem; align-items: center;">
			  <div style="position: relative;">
				<input 
				  type="text" 
				  placeholder="Search users..." 
				  value={searchTerm}
				  on:input={handleSearch}
				  style="padding: 0.5rem 0.75rem; padding-left: 2.25rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 0.875rem; outline: none; width: 200px;"
				/>
				<svg style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: #9ca3af;" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
				  <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			  </div>
			  <button 
				style="background-color: #0d9488; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.375rem; font-size: 0.875rem; cursor: pointer; display: flex; align-items: center;"
				on:click={showAddUserModal}
			  >
				<svg style="margin-right: 0.5rem;" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
				  <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				Add User
			  </button>
			</div>
		  </div>
		  
		  <!-- Table -->
		  <div style="overflow: auto;">
			{#if isLoading}
			  <div style="display: flex; justify-content: center; align-items: center; height: 10rem;">
				<div style="display: flex; align-items: center; color: #6b7280;">
				  <svg style="animation: spin 1s linear infinite; margin-right: 0.5rem;" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="60 15"/>
				  </svg>
				  Loading users...
				</div>
			  </div>
			{:else if error}
			  <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 10rem; color: #ef4444;">
				<div style="margin-bottom: 1rem;">Failed to fetch: {error}</div>
				<button 
				  style="background-color: #0d9488; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.375rem; font-size: 0.875rem; cursor: pointer;"
				  on:click={fetchUsers}
				>
				  Try Again
				</button>
			  </div>
			{:else if users.length === 0}
			  <div style="padding: 3rem 0; text-align: center; color: #6b7280; font-size: 0.875rem;">
				No users found. Click "Add User" to create your first user.
			  </div>
			{:else}
			  <!-- Table Header -->
			  <div style="display: grid; grid-template-columns: auto 1fr 1fr 1fr 1fr; border-bottom: 1px solid #e5e7eb; position: sticky; top: 0; background-color: #f9fafb;">
				<div style="padding: 0.75rem 1rem; font-size: 0.75rem; font-weight: 500; color: #6b7280;">
				  <input type="checkbox" style="margin-right: 0.75rem;">
				</div>
				<div style="padding: 0.75rem 1rem; font-size: 0.75rem; font-weight: 500; color: #6b7280;">Name/Email</div>
				<div style="padding: 0.75rem 1rem; font-size: 0.75rem; font-weight: 500; color: #6b7280;">Date of Birth</div>
				<div style="padding: 0.75rem 1rem; font-size: 0.75rem; font-weight: 500; color: #6b7280;">Phone Number</div>
				<div style="padding: 0.75rem 1rem; font-size: 0.75rem; font-weight: 500; color: #6b7280;">Actions</div>
			  </div>
			  
			  <!-- Table Body -->
			  {#each paginatedUsers as user (user.id)}
				<div 
				  style="display: grid; grid-template-columns: auto 1fr 1fr 1fr 1fr; border-bottom: 1px solid #e5e7eb; background-color: {selectedRows.includes(user) ? '#f0fdfa' : 'white'}; cursor: pointer;"
				  on:click={() => toggleRowSelection(user)}
				  on:keydown={(e) => e.key === 'Enter' && toggleRowSelection(user)}
				  role="button"
				  tabindex="0"
				>
				  <div style="padding: 0.75rem 1rem; font-size: 0.875rem; color: #111827;">
					<input 
					  type="checkbox" 
					  checked={selectedRows.includes(user)}
					  on:change={() => toggleRowSelection(user)}
					  style="margin-right: 0.75rem;"
					>
				  </div>
				  <div style="padding: 0.75rem 1rem; font-size: 0.875rem; color: #111827;">
					<div>{user.name}</div>
					<div style="font-size: 0.75rem; color: #6b7280;">{user.email}</div>
				  </div>
				  <div style="padding: 0.75rem 1rem; font-size: 0.875rem; color: #111827;">{user.formatted_dob}</div>
				  <div style="padding: 0.75rem 1rem; font-size: 0.875rem; color: #111827;">{user.phone_number || 'Not provided'}</div>
				  <div style="padding: 0.75rem 1rem; font-size: 0.875rem; color: #6b7280;">
					<button 
					  style="background-color: #f44336; color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; cursor: pointer;"
					  on:click={(e) => {
						e.stopPropagation();
						showDeleteConfirmationDialog(user);
					  }}
					  aria-label="Delete user {user.name}"
					>
					  Delete
					</button>
				  </div>
				</div>
			  {/each}
			  
			  <!-- Pagination -->
			  <div style="display: flex; justify-content: center; padding: 1rem;">
				<button 
				  style="background-color: white; border: 1px solid #d1d5db; color: #374151; padding: 0.5rem 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; cursor: pointer; margin-right: 0.5rem;"
				  on:click={goToPreviousPage}
				  disabled={currentPage === 1}
				>
				  Previous
				</button>
				
				{#each Array(totalPages) as _, i}
				  <button 
					style="background-color: {currentPage === i + 1 ? '#0d9488' : 'white'}; border: 1px solid {currentPage === i + 1 ? '#0d9488' : '#d1d5db'}; color: {currentPage === i + 1 ? 'white' : '#374151'}; padding: 0.5rem 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; cursor: pointer; margin-right: 0.5rem;"
					on:click={() => goToPage(i + 1)}
				  >
					{i + 1}
				  </button>
				{/each}
				
				<button 
				  style="background-color: white; border: 1px solid #d1d5db; color: #374151; padding: 0.5rem 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; cursor: pointer;"
				  on:click={goToNextPage}
				  disabled={currentPage === totalPages}
				>
				  Next
				</button>
			  </div>
			{/if}
		  </div>
		</div>
	  </div>
	</div>
	
	<!-- AI Chatbot Button -->
	<button>
	  on:click={toggleChat}
	  style="position: fixed; bottom: 2rem; right: 7rem; width: 3.5rem; height: 3.5rem; border-radius: 50%; background-color: #0d9488; color: white; border: none; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 50;"
	>
	  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
		<path d="M8 10.5C8 11.3284 7.32843 12 6.5 12C5.67157 12 5 11.3284 5 10.5C5 9.67157 5.67157 9 6.5 9C7.32843 9 8 9.67157 8 10.5Z" fill="currentColor"/>
		<path d="M13.5 10.5C13.5 11.3284 12.8284 12 12 12C11.1716 12 10.5 11.3284 10.5 10.5C10.5 9.67157 11.1716 9 12 9C12.8284 9 13.5 9.67157 13.5 10.5Z" fill="currentColor"/>
		<path d="M19 10.5C19 11.3284 18.3284 12 17.5 12C16.6716 12 16 11.3284 16 10.5C16 9.67157 16.6716 9 17.5 9C18.3284 9 19 9.67157 19 10.5Z" fill="currentColor"/>
		<path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2"/>
	  </svg>
	</button>
	
	<!-- Generate Summary Button -->
	<button>
	  on:click={showSummaryInterface}
	  style="position: fixed; bottom: 2rem; right: 2rem; width: 3.5rem; height: 3.5rem; border-radius: 50%; background-color: #0d9488; color: white; border: none; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 50;"
	  disabled={users.length === 0}
	  title={users.length === 0 ? "Add users first to generate a summary" : "Generate insights with Ollama gemma:2b"}
	>
	  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
		<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
		<path d="M9 12h6M9 16h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
	  </svg>
	</button>
	
	<!-- Chat Window -->
	{#if isChatOpen}
	  <div style="position: fixed; bottom: 6rem; right: 7rem; width: 20rem; height: 30rem; background-color: white; border-radius: 0.5rem; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); display: flex; flex-direction: column; overflow: hidden; z-index: 50;">
		<!-- Chat Header -->
		<div style="padding: 1rem; background-color: #0d9488; color: white; display: flex; justify-content: space-between; align-items: center;">
		  <div style="font-weight: 500;">AI Assistant</div>
		  <button>
			on:click={toggleChat}
			style="background: none; border: none; color: white; cursor: pointer;"
		  >
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			  <path d="M6 18L18 6M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		  </button>
		</div>
		
		<!-- Chat Messages -->
		<div style="flex: 1; padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem;">
		  {#if messages.length === 0}
			<div style="text-align: center; color: #6b7280; margin-top: 2rem;">
			  How can I help you today?
			</div>
		  {:else}
			{#each messages as message}
			  <div style="display: flex; justify-content: {message.sender === 'user' ? 'flex-end' : 'flex-start'};">
				<div style="max-width: 80%; padding: 0.75rem; border-radius: 0.5rem; background-color: {message.sender === 'user' ? '#0d9488' : '#f3f4f6'}; color: {message.sender === 'user' ? 'white' : '#111827'};">
				  {message.text}
				</div>
			  </div>
			{/each}
		  {/if}
		</div>
		
		<!-- Chat Input -->
		<div style="padding: 1rem; border-top: 1px solid #e5e7eb;">
		  <div style="display: flex; gap: 0.5rem;">
			<input 
			  type="text" 
			  bind:value={currentMessage}
			  on:keydown={handleKeydown}
			  placeholder="Type your message..." 
			  style="flex: 1; padding: 0.5rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 0.875rem; outline: none;"
			/>
			<button>
			  on:click={sendMessage}
			  style="background-color: #0d9488; color: white; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer;"
			>
			  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			  </svg>
			</button>
		  </div>
		</div>
	  </div>
	{/if}
	
	<!-- Delete Confirmation Modal -->
	{#if showDeleteConfirmation}
	  <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0, 0, 0, 0.5); display: flex; justify-content: center; align-items: center; z-index: 100;">
		<div style="background-color: white; padding: 1.5rem; border-radius: 0.5rem; width: 24rem; max-width: 90%;">
		  <h2 style="font-size: 1.25rem; font-weight: 600; color: #111827; margin-top: 0; margin-bottom: 1rem;">Confirm Deletion</h2>
		  <p style="margin-bottom: 1.5rem; color: #4b5563;">Are you sure you want to delete user "{userToDelete?.name}"? This action cannot be undone.</p>
		  <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
			<button 
			  style="background-color: white; border: 1px solid #d1d5db; color: #374151; padding: 0.5rem 1rem; border-radius: 0.375rem; font-size: 0.875rem; cursor: pointer;"
			  on:click={closeDeleteConfirmation}
			>
			  Cancel
			</button>
			<button 
			  style="background-color: #ef4444; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.375rem; font-size: 0.875rem; cursor: pointer;"
			  on:click={confirmDeleteUser}
			>
			  Delete
			</button>
		  </div>
		</div>
	  </div>
	{/if}
	
	<!-- Add User Modal -->
	{#if showAddUserForm}
	  <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0, 0, 0, 0.5); display: flex; justify-content: center; align-items: center; z-index: 100;">
		<div style="background-color: white; padding: 1.5rem; border-radius: 0.5rem; width: 30rem; max-width: 90%;">
		  <h2 style="font-size: 1.25rem; font-weight: 600; color: #111827; margin-top: 0; margin-bottom: 1rem;">Add New User</h2>
		  
		  {#if addUserError}
			<div style="background-color: #fee2e2; border: 1px solid #ef4444; color: #b91c1c; padding: 0.75rem; border-radius: 0.375rem; margin-bottom: 1rem; font-size: 0.875rem;">
			  {addUserError}
			</div>
		  {/if}
		  
		  <div style="margin-bottom: 1rem;">
			<label style="display: block; font-size: 0.875rem; font-weight: 500; color: #374151; margin-bottom: 0.5rem;">Name *</label>
			<input 
			  type="text" 
			  bind:value={newUser.name}
			  style="width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 0.875rem; outline: none;"
			  placeholder="Enter full name"
			/>
		  </div>
		  
		  <div style="margin-bottom: 1rem;">
			<label style="display: block; font-size: 0.875rem; font-weight: 500; color: #374151; margin-bottom: 0.5rem;">Email *</label>
			<input 
			  type="email" 
			  bind:value={newUser.email}
			  style="width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 0.875rem; outline: none;"
			  placeholder="Enter email address"
			/>
		  </div>
		  
		  <div style="margin-bottom: 1rem;">
			<label style="display: block; font-size: 0.875rem; font-weight: 500; color: #374151; margin-bottom: 0.5rem;">Date of Birth</label>
			<input 
			  type="date" 
			  bind:value={newUser.date_of_birth}
			  style="width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 0.875rem; outline: none;"
			/>
		  </div>
		  
		  <div style="margin-bottom: 1.5rem;">
			<label style="display: block; font-size: 0.875rem; font-weight: 500; color: #374151; margin-bottom: 0.5rem;">Phone Number</label>
			<input 
			  type="tel" 
			  bind:value={newUser.phone_number}
			  style="width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 0.875rem; outline: none;"
			  placeholder="Enter phone number"
			/>
		  </div>
		  
		  <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
			<button 
			  style="background-color: white; border: 1px solid #d1d5db; color: #374151; padding: 0.5rem 1rem; border-radius: 0.375rem; font-size: 0.875rem; cursor: pointer;"
			  on:click={closeAddUserForm}
			  disabled={isAddingUser}
			>
			  Cancel
			</button>
			<button 
			  style="background-color: #0d9488; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.375rem; font-size: 0.875rem; cursor: pointer; display: flex; align-items: center;"
			  on:click={addUser}
			  disabled={isAddingUser}
			>
			  {#if isAddingUser}
				<svg style="animation: spin 1s linear infinite; margin-right: 0.5rem;" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
				  <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="60 15"/>
				</svg>
				Adding...
			  {:else}
				Add User
			  {/if}
			</button>
		  </div>
		</div>
	  </div>
	{/if}
	
	<!-- Summary Modal -->
	{#if showSummaryModal}
	  <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0, 0, 0, 0.5); display: flex; justify-content: center; align-items: center; z-index: 100;">
		<div style="background-color: white; padding: 1.5rem; border-radius: 0.5rem; width: 40rem; max-width: 90%; max-height: 90vh; display: flex; flex-direction: column;">
		  <h2 style="font-size: 1.25rem; font-weight: 600; color: #111827; margin-top: 0; margin-bottom: 1rem;">Generate Insights with Ollama (gemma:2b)</h2>
		  
		  {#if summaryError}
			<div style="background-color: #fee2e2; border: 1px solid #ef4444; color: #b91c1c; padding: 0.75rem; border-radius: 0.375rem; margin-bottom: 1rem; font-size: 0.875rem;">
			  {summaryError}
			</div>
		  {/if}
		  
		  <div style="margin-bottom: 1rem;">
			<label style="display: block; font-size: 0.875rem; font-weight: 500; color: #374151; margin-bottom: 0.5rem;">Prompt</label>
			<textarea 
			  bind:value={summaryPrompt}
			  style="width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 0.875rem; outline: none; min-height: 5rem; resize: vertical;"
			  placeholder="Enter your prompt for the summary"
			></textarea>
			<div style="font-size: 0.75rem; color: #6b7280; margin-top: 0.25rem;">
			  Describe what kind of insights you want to generate from the user data.
			</div>
		  </div>
		  
		  <div style="margin-bottom: 1rem; flex: 1; overflow: auto;">
			<label style="display: block; font-size: 0.875rem; font-weight: 500; color: #374151; margin-bottom: 0.5rem;">Generated Insights</label>
			<div 
			  style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 0.875rem; background-color: #f9fafb; min-height: 10rem; max-height: 20rem; overflow-y: auto; white-space: pre-wrap;"
			>
			  {#if isGeneratingSummary}
				<div style="display: flex; justify-content: center; align-items: center; height: 10rem;">
				  <div style="display: flex; align-items: center; color: #6b7280;">
					<svg style="animation: spin 1s linear infinite; margin-right: 0.5rem;" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					  <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="60 15"/>
					</svg>
					Generating insights with Ollama gemma:2b...
				  </div>
				</div>
			  {:else if generatedSummary}
				{generatedSummary}
			  {:else}
				<div style="color: #6b7280; text-align: center; padding: 2rem 0;">
				  Click "Generate" to create insights from your user data using Ollama gemma:2b.
				</div>
			  {/if}
			</div>
		  </div>
		  
		  <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1rem;">
			<button 
			  style="background-color: white; border: 1px solid #d1d5db; color: #374151; padding: 0.5rem 1rem; border-radius: 0.375rem; font-size: 0.875rem; cursor: pointer;"
			  on:click={closeSummaryModal}
			  disabled={isGeneratingSummary}
			>
			  Close
			</button>
			{#if selectedRows.length > 0}
			  <button 
				style="background-color: #0d9488; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.375rem; font-size: 0.875rem; cursor: pointer; display: flex; align-items: center;"
				on:click={generateSummary}
				disabled={isGeneratingSummary || !summaryPrompt}
			  >
				{#if isGeneratingSummary}
				  <svg style="animation: spin 1s linear infinite; margin-right: 0.5rem;" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="60 15"/>
				  </svg>
				  Generating...
				{:else}
				  Generate Insights ({selectedRows.length} selected)
				{/if}
			  </button>
			{:else}
			  <button 
				style="background-color: #0d9488; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.375rem; font-size: 0.875rem; cursor: pointer; display: flex; align-items: center;"
				disabled
				title="Select users first"
			  >
				Generate Insights (No users selected)
			  </button>
			{/if}
		  </div>
		</div>
	  </div>
	{/if}
  </div>