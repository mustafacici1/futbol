// Import Firebase
import firebase from "firebase/app"
import "firebase/database"

// Firebase configuration - Replace with your Firebase config
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBJzRpMjBJ08zdbm8rPiYvr2UuE7taO0X4",
  authDomain: "futbolsite-7494b.firebaseapp.com",
  databaseURL: "https://futbolsite-7494b-default-rtdb.europe-west1.firebasedatabase.app",
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
  isPlayer1: false,
  gameListener: null,
  waitingListener: null,
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
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36)
}

function showScreen(screenName) {
  console.log("Switching to screen:", screenName)
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

// Clean up listeners
function cleanupListeners() {
  if (gameState.gameListener) {
    gameState.gameListener.off()
    gameState.gameListener = null
  }
  if (gameState.waitingListener) {
    gameState.waitingListener.off()
    gameState.waitingListener = null
  }
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
  console.log("Player ID generated:", gameState.playerId)

  try {
    // Clean up any existing listeners
    cleanupListeners()

    // Look for existing waiting games using a transaction to avoid race conditions
    const waitingGamesRef = database.ref("waitingGames")

    // Use a transaction to safely check and join/create games
    const result = await waitingGamesRef.transaction((waitingGames) => {
      if (waitingGames) {
        // Find the first available waiting game
        const gameIds = Object.keys(waitingGames)
        if (gameIds.length > 0) {
          const gameId = gameIds[0]
          const gameData = waitingGames[gameId]

          // Mark this game as taken by removing it
          delete waitingGames[gameId]

          // Store the game data for processing
          gameState.joinExistingGame = {
            gameId: gameId,
            gameData: gameData,
          }

          return waitingGames
        }
      }

      // No waiting games found, we'll create one
      return waitingGames
    })

    if (gameState.joinExistingGame) {
      // Join existing game
      const { gameId, gameData } = gameState.joinExistingGame
      delete gameState.joinExistingGame

      console.log("Joining existing game:", gameId)
      gameState.gameId = gameId
      gameState.isPlayer1 = false

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
        lastActivity: firebase.database.ServerValue.TIMESTAMP,
      }

      await database.ref("activeGames").child(gameId).set(activeGameData)
      console.log("Active game created")

      // Start listening to the game
      listenToGame(gameId)
      showScreen("game")
    } else {
      // Create new waiting game
      const gameId = generateId()
      gameState.gameId = gameId
      gameState.isPlayer1 = true

      console.log("Creating new waiting game:", gameId)

      const waitingGameData = {
        player1: {
          id: gameState.playerId,
          nickname: nickname,
        },
        createdAt: firebase.database.ServerValue.TIMESTAMP,
      }

      await waitingGamesRef.child(gameId).set(waitingGameData)
      console.log("Waiting game created")

      // Listen for player 2 to join
      listenForOpponent(gameId)
      showScreen("waiting")
    }
  } catch (error) {
    console.error("Error joining game:", error)
    alert("Error joining game. Please try again.")
  }
}

function listenForOpponent(gameId) {
  console.log("Listening for opponent in game:", gameId)

  // Listen to active games for when the game starts
  const activeGameRef = database.ref("activeGames").child(gameId)

  gameState.waitingListener = activeGameRef.on("value", (snapshot) => {
    const gameData = snapshot.val()
    console.log("Waiting listener - game data:", gameData)

    if (gameData && gameData.gameStarted && gameData.player2) {
      console.log("Game started! Moving to game screen")

      // Clean up waiting listener
      if (gameState.waitingListener) {
        activeGameRef.off("value", gameState.waitingListener)
        gameState.waitingListener = null
      }

      // Start game listener
      listenToGame(gameId)
      showScreen("game")
    }
  })

  // Also listen for the waiting game being removed (timeout or cancel)
  const waitingGameRef = database.ref("waitingGames").child(gameId)
  waitingGameRef.on("value", (snapshot) => {
    if (!snapshot.exists() && !gameState.gameEnded) {
      // Waiting game was removed, check if we should go back to nickname screen
      setTimeout(() => {
        if (screens.waiting.classList.contains("active")) {
          console.log("Waiting game removed, returning to nickname screen")
          resetGame()
          showScreen("nickname")
        }
      }, 1000)
    }
  })
}

function listenToGame(gameId) {
  console.log("Starting game listener for:", gameId)

  const gameRef = database.ref("activeGames").child(gameId)

  gameState.gameListener = gameRef.on("value", (snapshot) => {
    const gameData = snapshot.val()
    console.log("Game listener - game data:", gameData)

    if (!gameData) {
      console.log("Game data not found")
      return
    }

    updateGameDisplay(gameData)

    // Check if game ended
    if (gameData.scores.player1 >= 3 || gameData.scores.player2 >= 3) {
      if (!gameState.gameEnded) {
        gameState.gameEnded = true
        console.log("Game ended!")
        setTimeout(() => showGameResult(gameData), 2000)
      }
    }
  })
}

function updateGameDisplay(gameData) {
  console.log("Updating game display")

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
  gameState.isMyTurn =
    (gameState.isPlayer1 && gameData.turn === "player1") || (!gameState.isPlayer1 && gameData.turn === "player2")

  console.log("Is my turn:", gameState.isMyTurn, "Turn:", gameData.turn, "Is Player 1:", gameState.isPlayer1)
}

async function selectAnswer(teamIndex) {
  if (!gameState.isMyTurn || gameState.gameEnded) {
    console.log("Not my turn or game ended")
    return
  }

  console.log("Selecting answer:", teamIndex)

  const gameRef = database.ref("activeGames").child(gameState.gameId)

  try {
    const snapshot = await gameRef.once("value")
    const gameData = snapshot.val()

    if (!gameData) {
      console.log("Game data not found when selecting answer")
      return
    }

    const isCorrect = teamIndex === gameState.currentQuestion.correctIndex

    // Update scores
    const newScores = { ...gameData.scores }
    if (gameState.isPlayer1) {
      newScores.player1 += isCorrect ? 1 : -1
    } else {
      newScores.player2 += isCorrect ? 1 : -1
    }

    // Show feedback immediately
    showAnswerFeedback(teamIndex, isCorrect)

    // Generate new question after delay
    setTimeout(async () => {
      const newQuestion = generateQuestion()
      const nextTurn = gameData.turn === "player1" ? "player2" : "player1"

      await gameRef.update({
        scores: newScores,
        currentQuestion: newQuestion,
        turn: nextTurn,
        lastActivity: firebase.database.ServerValue.TIMESTAMP,
      })
    }, 2000)
  } catch (error) {
    console.error("Error selecting answer:", error)
  }
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
  const myScore = gameState.isPlayer1 ? gameData.scores.player1 : gameData.scores.player2
  const opponentScore = gameState.isPlayer1 ? gameData.scores.player2 : gameData.scores.player1

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
  cleanupListeners()
  database.ref("activeGames").child(gameState.gameId).remove()
}

async function cancelWaiting() {
  console.log("Canceling waiting")

  if (gameState.gameId) {
    await database.ref("waitingGames").child(gameState.gameId).remove()
  }

  cleanupListeners()
  resetGame()
  showScreen("nickname")
}

function resetGame() {
  console.log("Resetting game")

  cleanupListeners()
  gameState.gameId = null
  gameState.playerId = null
  gameState.currentQuestion = null
  gameState.isMyTurn = false
  gameState.gameEnded = false
  gameState.isPlayer1 = false
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

// Clean up old games periodically
setInterval(async () => {
  const now = Date.now()
  const fiveMinutes = 5 * 60 * 1000

  // Clean up old waiting games
  try {
    const waitingGamesRef = database.ref("waitingGames")
    const waitingSnapshot = await waitingGamesRef.once("value")
    const waitingGames = waitingSnapshot.val()

    if (waitingGames) {
      Object.keys(waitingGames).forEach((gameId) => {
        const game = waitingGames[gameId]
        if (game.createdAt && now - game.createdAt > fiveMinutes) {
          waitingGamesRef.child(gameId).remove()
        }
      })
    }

    // Clean up old active games
    const activeGamesRef = database.ref("activeGames")
    const activeSnapshot = await activeGamesRef.once("value")
    const activeGames = activeSnapshot.val()

    if (activeGames) {
      Object.keys(activeGames).forEach((gameId) => {
        const game = activeGames[gameId]
        if (game.lastActivity && now - game.lastActivity > fiveMinutes) {
          activeGamesRef.child(gameId).remove()
        }
      })
    }
  } catch (error) {
    console.error("Error cleaning up old games:", error)
  }
}, 60000) // Check every minute

// Handle page unload
window.addEventListener("beforeunload", () => {
  if (gameState.gameId) {
    // Try to clean up waiting game if we're leaving
    if (gameState.isPlayer1 && screens.waiting.classList.contains("active")) {
      database.ref("waitingGames").child(gameState.gameId).remove()
    }
  }
  cleanupListeners()
})
