// Import Firebase
import firebase from "firebase/app"
import "firebase/database"

  const firebaseConfig = {
    apiKey: "AIzaSyBJzRpMjBJ08zdbm8rPiYvr2UuE7taO0X4",
    authDomain: "futbolsite-7494b.firebaseapp.com",
    projectId: "futbolsite-7494b",
    storageBucket: "futbolsite-7494b.firebasestorage.app",
    messagingSenderId: "307816905692",
    appId: "1:307816905692:web:7ee735beccab7a48512d19",
    measurementId: "G-RFWMEVQ639"
  };

// Initialize Firebase
firebase.initializeApp(firebaseConfig)
const database = firebase.database()

// Game state
const gameState = {
  playerId: null,
  gameId: null,
  playerData: [],
  currentQuestion: null,
  isMyTurn: false,
  gameEnded: false,
}

// DOM elements
const screens = {
  nickname: document.getElementById("nicknameScreen"),
  waiting: document.getElementById("waitingScreen"),
  game: document.getElementById("gameScreen"),
  result: document.getElementById("resultScreen"),
}

const elements = {
  nicknameInput: document.getElementById("nicknameInput"),
  joinGameBtn: document.getElementById("joinGameBtn"),
  cancelWaitBtn: document.getElementById("cancelWaitBtn"),
  player1Name: document.getElementById("player1Name"),
  player2Name: document.getElementById("player2Name"),
  player1Score: document.getElementById("player1Score"),
  player2Score: document.getElementById("player2Score"),
  player1Display: document.getElementById("player1Display"),
  player2Display: document.getElementById("player2Display"),
  optionBtns: document.querySelectorAll(".option-btn"),
  feedback: document.getElementById("feedback"),
  resultTitle: document.getElementById("resultTitle"),
  finalScores: document.getElementById("finalScores"),
  playAgainBtn: document.getElementById("playAgainBtn"),
  homeBtn: document.getElementById("homeBtn"),
}

// Load player data
async function loadPlayerData() {
  try {
    const response = await fetch("./superlig_players.json")
    gameState.playerData = await response.json()
    console.log("Player data loaded:", gameState.playerData.length, "players")
  } catch (error) {
    console.error("Error loading player data:", error)
    alert("Error loading game data. Please refresh the page.")
  }
}

// Utility functions
function generateId() {
  return Math.random().toString(36).substr(2, 9)
}

function showScreen(screenName) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"))
  screens[screenName].classList.add("active")
}

function findCommonTeams(player1, player2) {
  const player1Teams = new Set()
  player1.teams_history.forEach((teamData) => {
    player1Teams.add(teamData.team)
  })

  const commonTeams = []
  player2.teams_history.forEach((teamData) => {
    if (player1Teams.has(teamData.team)) {
      commonTeams.push(teamData.team)
    }
  })

  return commonTeams
}

function getAllTeams() {
  const allTeams = new Set()
  gameState.playerData.forEach((player) => {
    player.teams_history.forEach((teamData) => {
      allTeams.add(teamData.team)
    })
  })
  return Array.from(allTeams)
}

function generateQuestion() {
  const players = gameState.playerData
  let attempts = 0
  const maxAttempts = 100

  while (attempts < maxAttempts) {
    const player1 = players[Math.floor(Math.random() * players.length)]
    const player2 = players[Math.floor(Math.random() * players.length)]

    if (player1.name !== player2.name) {
      const commonTeams = findCommonTeams(player1, player2)

      if (commonTeams.length > 0) {
        const correctTeam = commonTeams[Math.floor(Math.random() * commonTeams.length)]
        const allTeams = getAllTeams()
        const wrongTeams = allTeams.filter((team) => !commonTeams.includes(team))

        if (wrongTeams.length >= 4) {
          const options = [correctTeam]

          // Add 4 random wrong teams
          const shuffledWrongTeams = wrongTeams.sort(() => 0.5 - Math.random())
          options.push(...shuffledWrongTeams.slice(0, 4))

          // Shuffle options
          const shuffledOptions = options.sort(() => 0.5 - Math.random())

          return {
            player1: player1.name,
            player2: player2.name,
            correctTeam: correctTeam,
            options: shuffledOptions,
            correctIndex: shuffledOptions.indexOf(correctTeam),
          }
        }
      }
    }
    attempts++
  }

  console.error("Could not generate a valid question after", maxAttempts, "attempts")
  return null
}

// Game functions
async function joinGame() {
  const nickname = elements.nicknameInput.value.trim()
  if (!nickname) {
    alert("Please enter a nickname")
    return
  }

  if (gameState.playerData.length === 0) {
    await loadPlayerData()
  }

  gameState.playerId = generateId()

  // Look for existing waiting games
  const waitingGamesRef = database.ref("waitingGames")
  const snapshot = await waitingGamesRef.once("value")
  const waitingGames = snapshot.val()

  if (waitingGames) {
    // Join existing game
    const gameId = Object.keys(waitingGames)[0]
    const gameData = waitingGames[gameId]

    gameState.gameId = gameId

    // Remove from waiting games and create active game
    await waitingGamesRef.child(gameId).remove()

    const activeGameData = {
      player1: gameData.player1,
      player2: {
        id: gameState.playerId,
        nickname: nickname,
      },
      scores: { player1: 0, player2: 0 },
      currentQuestion: generateQuestion(),
      gameStarted: true,
      turn: "player1",
    }

    await database.ref("activeGames").child(gameId).set(activeGameData)

    // Listen to game updates
    listenToGame(gameId)
    showScreen("game")
  } else {
    // Create new waiting game
    const gameId = generateId()
    gameState.gameId = gameId

    const waitingGameData = {
      player1: {
        id: gameState.playerId,
        nickname: nickname,
      },
      createdAt: Date.now(),
    }

    await waitingGamesRef.child(gameId).set(waitingGameData)

    // Listen for player 2 to join
    listenForOpponent(gameId)
    showScreen("waiting")
  }
}

function listenForOpponent(gameId) {
  const activeGameRef = database.ref("activeGames").child(gameId)

  activeGameRef.on("value", (snapshot) => {
    const gameData = snapshot.val()
    if (gameData && gameData.gameStarted) {
      listenToGame(gameId)
      showScreen("game")
    }
  })
}

function listenToGame(gameId) {
  const gameRef = database.ref("activeGames").child(gameId)

  gameRef.on("value", (snapshot) => {
    const gameData = snapshot.val()
    if (!gameData) return

    updateGameDisplay(gameData)

    // Check if game ended
    if (gameData.scores.player1 >= 3 || gameData.scores.player2 >= 3) {
      if (!gameState.gameEnded) {
        gameState.gameEnded = true
        setTimeout(() => showGameResult(gameData), 2000)
      }
    }
  })
}

function updateGameDisplay(gameData) {
  // Update player names and scores
  elements.player1Name.textContent = gameData.player1.nickname
  elements.player2Name.textContent = gameData.player2.nickname
  elements.player1Score.textContent = gameData.scores.player1
  elements.player2Score.textContent = gameData.scores.player2

  // Update question display
  if (gameData.currentQuestion) {
    gameState.currentQuestion = gameData.currentQuestion
    elements.player1Display.textContent = gameData.currentQuestion.player1
    elements.player2Display.textContent = gameData.currentQuestion.player2

    // Update option buttons
    elements.optionBtns.forEach((btn, index) => {
      btn.textContent = gameData.currentQuestion.options[index]
      btn.disabled = false
      btn.className = "option-btn"
    })

    elements.feedback.textContent = ""
    elements.feedback.className = "feedback"
  }

  // Determine if it's player's turn
  const isPlayer1 = gameData.player1.id === gameState.playerId
  gameState.isMyTurn = (isPlayer1 && gameData.turn === "player1") || (!isPlayer1 && gameData.turn === "player2")
}

async function selectAnswer(teamIndex) {
  if (!gameState.isMyTurn || gameState.gameEnded) return

  const gameRef = database.ref("activeGames").child(gameState.gameId)
  const snapshot = await gameRef.once("value")
  const gameData = snapshot.val()

  if (!gameData) return

  const isCorrect = teamIndex === gameState.currentQuestion.correctIndex
  const isPlayer1 = gameData.player1.id === gameState.playerId

  // Update scores
  const newScores = { ...gameData.scores }
  if (isPlayer1) {
    newScores.player1 += isCorrect ? 1 : -1
  } else {
    newScores.player2 += isCorrect ? 1 : -1
  }

  // Show feedback
  showAnswerFeedback(teamIndex, isCorrect)

  // Generate new question after delay
  setTimeout(async () => {
    const newQuestion = generateQuestion()
    const nextTurn = gameData.turn === "player1" ? "player2" : "player1"

    await gameRef.update({
      scores: newScores,
      currentQuestion: newQuestion,
      turn: nextTurn,
    })
  }, 2000)
}

function showAnswerFeedback(selectedIndex, isCorrect) {
  elements.optionBtns.forEach((btn, index) => {
    btn.disabled = true
    if (index === gameState.currentQuestion.correctIndex) {
      btn.classList.add("correct")
    } else if (index === selectedIndex && !isCorrect) {
      btn.classList.add("incorrect")
    }
  })

  elements.feedback.textContent = isCorrect
    ? "✅ Correct! +1 point"
    : `❌ Wrong! The correct answer was ${gameState.currentQuestion.correctTeam}. -1 point`
  elements.feedback.className = `feedback ${isCorrect ? "correct" : "incorrect"}`
}

function showGameResult(gameData) {
  const isPlayer1 = gameData.player1.id === gameState.playerId
  const myScore = isPlayer1 ? gameData.scores.player1 : gameData.scores.player2
  const opponentScore = isPlayer1 ? gameData.scores.player2 : gameData.scores.player1

  if (myScore >= 3) {
    elements.resultTitle.textContent = "🎉 You Won!"
  } else {
    elements.resultTitle.textContent = "😔 You Lost!"
  }

  elements.finalScores.innerHTML = `
        <div>Your Score: ${myScore}</div>
        <div>Opponent Score: ${opponentScore}</div>
    `

  showScreen("result")

  // Clean up game
  database.ref("activeGames").child(gameState.gameId).remove()
}

async function cancelWaiting() {
  if (gameState.gameId) {
    await database.ref("waitingGames").child(gameState.gameId).remove()
  }
  resetGame()
  showScreen("nickname")
}

function resetGame() {
  gameState.gameId = null
  gameState.playerId = null
  gameState.currentQuestion = null
  gameState.isMyTurn = false
  gameState.gameEnded = false
  elements.nicknameInput.value = ""
}

// Event listeners
elements.joinGameBtn.addEventListener("click", joinGame)
elements.cancelWaitBtn.addEventListener("click", cancelWaiting)
elements.playAgainBtn.addEventListener("click", () => {
  resetGame()
  showScreen("nickname")
})
elements.homeBtn.addEventListener("click", () => {
  resetGame()
  showScreen("nickname")
})

elements.optionBtns.forEach((btn, index) => {
  btn.addEventListener("click", () => selectAnswer(index))
})

elements.nicknameInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    joinGame()
  }
})

// Initialize
loadPlayerData()

// Clean up old waiting games (older than 5 minutes)
setInterval(async () => {
  const waitingGamesRef = database.ref("waitingGames")
  const snapshot = await waitingGamesRef.once("value")
  const waitingGames = snapshot.val()

  if (waitingGames) {
    const now = Date.now()
    const fiveMinutes = 5 * 60 * 1000

    Object.keys(waitingGames).forEach((gameId) => {
      if (now - waitingGames[gameId].createdAt > fiveMinutes) {
        waitingGamesRef.child(gameId).remove()
      }
    })
  }
}, 60000) // Check every minute
