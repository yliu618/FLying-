// 1. Canvas Setup
const canvas = document.getElementById('gameCanvas');
canvas.width = 1080;
canvas.height = 1920;
const ctx = canvas.getContext('2d');

// 2. Game Variables
let player = null;
let enemies = [];
let bullets = [];
let particles = []; // Global array for particles
let score = 0;
let lives = 3;
let gameOver = false;

let playerImage = null;
let enemyImage = null;
let imagesToLoad = 2;
let imagesLoaded = 0;

let lastEnemySpawnTime = 0;
const enemySpawnInterval = 2000; // milliseconds
let lastTime = 0; // For deltaTime, though not fully implemented for invincibility timer yet

// --- Player Class ---
class Player {
    constructor(x, y, width, height, image) {
        this.x = x; // Center x
        this.y = y; // Center y
        this.width = width;
        this.height = height;
        this.image = image;
        this.speed = 5; // Not used for direct mouse follow
        this.invincible = false;
        this.invincibilityTimer = 0;
        this.invincibleDuration = 500; // 0.5 seconds (in milliseconds)

        this.trail = [];
        this.trailMaxLength = 10;
        this.minSpeedForTrail = 5; // Pixels moved per mousemove event to generate a trail point
        this.prevX = x; // Initialize prevX (though primarily updated in mousemove)
        this.prevY = y; // Initialize prevY (though primarily updated in mousemove)

        this.shootInterval = 300; // milliseconds
        this.lastShotTime = 0;
    }

    draw(ctx) {
        // Draw trail first
        // Loop from end to start for correct layering (older segments drawn first)
        for (let i = this.trail.length - 1; i >= 0; i--) {
            const segment = this.trail[i];
            ctx.save();
            // Apply segment's opacity; consider player's invincibility for trail visibility
            const trailBaseOpacity = this.invincible ? 0.25 : 0.5; // Trail is fainter if player is invincible
            ctx.globalAlpha = segment.opacity * trailBaseOpacity;

            if (this.image && this.image.complete && this.image.naturalHeight !== 0) {
                // Player's x,y is center, so draw segment image centered
                ctx.drawImage(this.image, segment.x - segment.width / 2, segment.y - segment.height / 2, segment.width, segment.height);
            } else { // Fallback if image not loaded for the trail
                ctx.fillStyle = `rgba(0, 0, 255, ${segment.opacity * trailBaseOpacity})`;
                ctx.fillRect(segment.x - segment.width / 2, segment.y - segment.height / 2, segment.width, segment.height);
            }
            ctx.restore();
        }

        // Draw main player
        ctx.save();
        if (this.invincible) {
            ctx.globalAlpha = 0.5; // Main player invincibility alpha
        }
        if (this.image && this.image.complete && this.image.naturalHeight !== 0) {
            ctx.drawImage(this.image, this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        } else {
            ctx.fillStyle = 'blue';
            ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        }
        ctx.restore(); 
    }

    update() { 
        if (this.invincible) {
            this.invincibilityTimer -= 16; 
            if (this.invincibilityTimer <= 0) {
                this.invincible = false;
                console.log("Player invincibility ended.");
            }
        }

        // Manage trail opacity and length
        for (let i = this.trail.length - 1; i >= 0; i--) {
            const segment = this.trail[i];
            segment.opacity -= 0.1; // Adjust fade speed
            if (segment.opacity <= 0) {
                this.trail.splice(i, 1);
            }
        }
        // Ensure trail does not exceed max length (removes oldest if new ones are added quickly)
        while (this.trail.length > this.trailMaxLength) {
            this.trail.pop(); // Remove from the end (oldest because we unshift)
        }
        // Note: prevX and prevY are not updated here, they are part of the mousemove logic
        // to capture position *before* the update from that event.
    }
}

// --- Enemy Class ---
class Enemy {
    constructor(x, y, width, height, image, speed, amplitude, frequency) {
        this.x = x; // Top-left x
        this.y = y; // Top-left y
        this.width = width;
        this.height = height;
        this.image = image;
        this.speed = speed;
        this.amplitude = amplitude;
        this.frequency = frequency;
        this.initialX = x;
        this.angle = Math.random() * Math.PI * 2;
        this.shootInterval = 1500 + Math.random() * 1000;
        this.lastShotTime = Date.now();
    }

    draw(ctx) {
        if (this.image && this.image.complete && this.image.naturalHeight !== 0) {
            ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        } else {
            ctx.fillStyle = 'red';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }

    update(playerRef) {
        this.y += this.speed;
        // S-curve movement based on initialX, so enemy's own x is top-left
        this.x = this.initialX + Math.sin(this.angle) * this.amplitude;
        this.angle += this.frequency;

        // Optional: Keep enemy within horizontal canvas bounds for S-curve
        if (this.x < 0) {
            this.x = 0;
            this.initialX = this.x - Math.sin(this.angle) * this.amplitude;
        } else if (this.x + this.width > canvas.width) {
            this.x = canvas.width - this.width;
            this.initialX = this.x - Math.sin(this.angle) * this.amplitude;
        }

        if (!gameOver && playerRef && Date.now() - this.lastShotTime > this.shootInterval) {
            enemyShoot(this, playerRef);
            this.lastShotTime = Date.now();
        }
    }
}

// --- Bullet Class ---
class Bullet {
    constructor(x, y, width, height, color, speed, velocityX, velocityY, type = 'enemy') { // Added type, defaults to 'enemy'
        this.x = x; // Top-left x
        this.y = y; // Top-left y
        this.width = width;
        this.height = height;
        this.color = color;
        this.speed = speed;
        this.velocityX = velocityX;
        this.velocityY = velocityY;
        this.type = type; // 'enemy' or 'player'
        // Set trailColor based on type
        if (this.type === 'player') {
            this.trailColor = 'rgba(173, 216, 230, 0.5)'; // Lightblue trail for player
        } else { // enemy
            this.trailColor = 'rgba(200, 0, 255, 0.3)'; // Purple trail for enemy
        }
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }

    update() {
        this.x += this.velocityX;
        this.y += this.velocityY;

        // Create trail particles for both player and enemy bullets
        const numTrailParticles = (this.type === 'player') ? 1 : 2; // Player bullets less dense trail
        for (let i = 0; i < numTrailParticles; i++) {
            particles.push(new Particle(
                this.x + this.width / 2, // Center of the bullet
                this.y + this.height / 2,
                this.trailColor,
                Math.random() * ((this.type === 'player') ? 1.5 : 2) + 1, // Player trail slightly smaller
                (Math.random() - 0.5) * 0.5, 
                (Math.random() - 0.5) * 0.5, 
                Math.random() * 15 + 10  // lifespan 10-25 updates
            ));
        }
    }
}

// --- Particle Class ---
class Particle {
    constructor(x, y, color, size, speedX, speedY, lifeSpan) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = size;
        this.speedX = speedX;
        this.speedY = speedY;
        this.lifeSpan = lifeSpan;
        this.initialLifeSpan = lifeSpan; // Store initial for fading calculation
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.lifeSpan--;
    }

    draw(ctx) {
        ctx.save(); // Save current context state
        ctx.globalAlpha = Math.max(0, this.lifeSpan / this.initialLifeSpan); // Fade out
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); // Draw as a circle
        ctx.fill();
        ctx.restore(); // Restore context state (especially globalAlpha)
    }
}


// --- Collision Detection ---
function checkCollision(rect1, rect2) {
    // rect1 is player: x, y is center. Convert to top-left for collision check.
    const r1TopLeftX = rect1.x - rect1.width / 2;
    const r1TopLeftY = rect1.y - rect1.height / 2;

    // rect2 is enemy or bullet: x, y is top-left.
    const r2TopLeftX = rect2.x;
    const r2TopLeftY = rect2.y;

    return (
        r1TopLeftX < r2TopLeftX + rect2.width &&
        r1TopLeftX + rect1.width > r2TopLeftX &&
        r1TopLeftY < r2TopLeftY + rect2.height &&
        r1TopLeftY + rect1.height > r2TopLeftY
    );
}


// 3. Image Loading
function onImageLoad() {
    imagesLoaded++;
    if (imagesLoaded === imagesToLoad) {
        console.log("All images loaded.");
        player = new Player(canvas.width / 2, canvas.height - 100, 80, 80, playerImage);
        console.log("Player object created with image:", player);
        resetGame(); // Initialize game state properly including player position
    }
}

function loadImages() {
    console.log("loadImages function called.");
    playerImage = new Image();
    playerImage.src = 'player.png';
    playerImage.onload = () => { console.log("Player image loaded."); onImageLoad(); };
    playerImage.onerror = () => { console.error("Error loading player.png."); onImageLoad(); };

    enemyImage = new Image();
    enemyImage.src = 'enemy.png';
    enemyImage.onload = () => { console.log("Enemy image loaded."); onImageLoad(); };
    enemyImage.onerror = () => { console.error("Error loading enemy.png."); onImageLoad(); };
}
loadImages();

// --- Enemy Spawning ---
function spawnEnemy() {
    if (!enemyImage) {
        // console.warn("Enemy image not fully loaded or error, placeholder will be used.");
    }
    const enemyWidth = 60;
    const enemyHeight = 60;
    // Spawn at a random X, ensuring initialX is set for S-curve
    const spawnX = Math.random() * (canvas.width - enemyWidth); // This is initialX (top-left)

    const newEnemy = new Enemy(
        spawnX,
        -enemyHeight,
        enemyWidth,
        enemyHeight,
        enemyImage,
        2, 50, 0.05
    );
    enemies.push(newEnemy);
}

// --- Enemy Shooting Logic ---
function enemyShoot(enemy, targetPlayer) {
    if (!targetPlayer) return;

    const bulletSpeed = 5;
    const spreadAngle = 0.2; // Radians

    // Enemy's x,y is top-left, adjust shot origin to enemy center for better aesthetics
    const enemyCenterX = enemy.x + enemy.width / 2;
    const enemyCenterY = enemy.y + enemy.height / 2;

    const dx = targetPlayer.x - enemyCenterX; // targetPlayer.x is already center
    const dy = targetPlayer.y - enemyCenterY; // targetPlayer.y is already center
    const baseAngle = Math.atan2(dy, dx);

    const angles = [baseAngle - spreadAngle, baseAngle, baseAngle + spreadAngle];

    angles.forEach(angle => {
        const velocityX = Math.cos(angle) * bulletSpeed;
        const velocityY = Math.sin(angle) * bulletSpeed;
        // Bullet x,y is top-left. Spawn from enemy's center.
        bullets.push(new Bullet(enemyCenterX - 5, enemyCenterY, 10, 20, 'purple', bulletSpeed, velocityX, velocityY, 'enemy'));
    });
}

// 4. Background Drawing
const stars = [];
const numStars = 100;
for (let i = 0; i < numStars; i++) {
    stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 2 + 1
    });
}

function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#230056');
    gradient.addColorStop(1, '#000000');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'white';
    stars.forEach(star => {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fill();
    });
}

// --- Game Over Screen ---
function showGameOverScreen() {
    gameOverScreen.style.display = 'block';
    finalScoreDisplay.textContent = 'Final Score: ' + score;
}

// --- Reset Game ---
function resetGame() {
    console.log("Resetting game...");
    score = 0;
    lives = 3;
    gameOver = false;
    enemies = [];
    bullets = [];
    particles = []; // Clear particles on reset

    if (player) {
        player.x = canvas.width / 2;
        player.y = canvas.height - 100;
        player.invincible = false;
        player.invincibilityTimer = 0;
        player.trail = []; // Reset trail
        player.prevX = player.x; // Reset prev positions to current
        player.prevY = player.y;
        player.lastShotTime = 0; // Reset last shot time
    } else if (playerImage && playerImage.complete) { // If player was null but image loaded
         player = new Player(canvas.width / 2, canvas.height - 100, 80, 80, playerImage);
         // Player constructor already initializes trail, prevX, prevY, shootInterval, lastShotTime
    }


    updateScoreDisplay();
    updateLivesDisplay();
    gameOverScreen.style.display = 'none';
    lastEnemySpawnTime = Date.now(); // Reset enemy spawn timer
    // gameLoop will continue running, or requestAnimationFrame will pick it up
}


// 5. Game Loop
function update() { // timestamp can be passed for deltaTime
    if (gameOver) {
        return; // Stop updates if game is over
    }

    // Spawn enemies if images are loaded
    if (imagesLoaded === imagesToLoad && Date.now() - lastEnemySpawnTime > enemySpawnInterval) {
        spawnEnemy();
        lastEnemySpawnTime = Date.now();
    }

    if (player) {
        player.update(); // Pass deltaTime if using it
    }

    // Update enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        enemies[i].update(player);
        if (enemies[i].y > canvas.height + enemies[i].height) {
            enemies.splice(i, 1);
        }
    }

    // Update bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].update();
        if (bullets[i].x < -bullets[i].width || bullets[i].x > canvas.width || bullets[i].y < -bullets[i].height || bullets[i].y > canvas.height) {
            bullets.splice(i, 1);
        }
    }

    // Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].lifeSpan <= 0) {
            particles.splice(i, 1);
        }
    }

    // Collision Handling

    // Player Bullet vs Enemy Collision
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        if (bullet.type === 'player') {
            for (let j = enemies.length - 1; j >= 0; j--) {
                const enemy = enemies[j];
                // checkCollision expects player-like (center x,y) as first arg, enemy/bullet (top-left x,y) as second
                // Here, bullet is rect1 (player-like) and enemy is rect2 (enemy-like)
                // So we need to adapt checkCollision or ensure consistent coordinate systems for things being checked
                // For simplicity, let's make a temporary bullet object for checkCollision if it expects center x,y
                // OR adjust checkCollision.
                // Current checkCollision: rect1 (player) is center, rect2 (enemy/bullet) is top-left.
                // So, bullet (player bullet) should be rect1-like, enemy is rect2-like.
                // Bullet's x,y is top-left. Enemy's x,y is top-left.
                // We need a collision check for two top-left rects.
                // Let's make a new simple AABB for this:
                const bulletRect = { x: bullet.x, y: bullet.y, width: bullet.width, height: bullet.height };
                const enemyRect = { x: enemy.x, y: enemy.y, width: enemy.width, height: enemy.height };

                if (bulletRect.x < enemyRect.x + enemyRect.width &&
                    bulletRect.x + bulletRect.width > enemyRect.x &&
                    bulletRect.y < enemyRect.y + enemyRect.height &&
                    bulletRect.y + bulletRect.height > enemyRect.y) {
                    
                    createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 'orange');
                    enemies.splice(j, 1);
                    bullets.splice(i, 1);
                    score += 20; // Different score for shooting down
                    updateScoreDisplay();
                    console.log("Enemy hit by player bullet. Score:", score);
                    break; // Bullet is gone, no need to check other enemies for this bullet
                }
            }
        }
    }


    if (player && !player.invincible) {
        // Player-Enemy Bullet Collision
        for (let i = bullets.length - 1; i >= 0; i--) { // Re-iterate bullets as some might have been removed
            const bullet = bullets[i];
            if (bullet.type === 'enemy') {
                // Player's x,y is center. Bullet's x,y is top-left. checkCollision handles this.
                if (checkCollision(player, bullet)) { 
                    lives--;
                    updateLivesDisplay();
                    bullets.splice(i, 1); // Remove bullet
                    player.invincible = true;
                    player.invincibilityTimer = player.invincibleDuration;
                    console.log("Player hit by enemy bullet. Lives:", lives);

                    if (lives <= 0) {
                        gameOver = true;
                        showGameOverScreen();
                        console.log("Game Over - player hit by bullet.");
                        break; 
                    }
                }
            }
        }

        if (gameOver) return;

        // Player-Enemy Collision (player is not invincible)
        for (let i = enemies.length - 1; i >= 0; i--) {
            const enemy = enemies[i];
             // Player's x,y is center. Enemy's x,y is top-left. checkCollision handles this.
            if (checkCollision(player, enemy)) {
                createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 'orange');
                enemies.splice(i, 1); 
                score += 10; 
                updateScoreDisplay();
                console.log("Player collided with enemy, enemy destroyed. Score:", score);
            }
        }
    }
}


function render() {
    drawBackground();

    if (player && !gameOver) { // Only draw player if not game over
        player.draw(ctx);
    }

    enemies.forEach(enemy => enemy.draw(ctx));
    bullets.forEach(bullet => bullet.draw(ctx));
    particles.forEach(particle => particle.draw(ctx)); // Draw particles

    updateScoreDisplay();
    updateLivesDisplay();

    // Game Over screen is handled by its own function, conditionally called in update/render
    if (gameOver) {
        showGameOverScreen(); // Ensure it's displayed if render is called when gameOver is true
    }
}


function gameLoop(timestamp) { // timestamp is provided by requestAnimationFrame
    // const deltaTime = timestamp - lastTime; // Would be used for frame-rate independent movement/timers
    // lastTime = timestamp;

    requestAnimationFrame(gameLoop);
    update(); // Pass deltaTime if using it
    render();
}

// 6. Initial DOM Element References
const scoreDisplay = document.getElementById('score');
const livesDisplay = document.getElementById('lives');
const gameOverScreenElement = document.getElementById('game-over-screen'); // Renamed for clarity
const finalScoreDisplay = document.getElementById('final-score');
const restartButton = document.getElementById('restart-button');

// 7. Score and Lives Update Functions
function updateScoreDisplay() {
    scoreDisplay.textContent = `Score: ${score}`;
}

function updateLivesDisplay() {
    if (livesDisplay) {
        livesDisplay.textContent = Array(lives > 0 ? lives : 0).fill('❤️').join('');
    }
}

// Mouse Control
canvas.addEventListener('mousemove', (event) => {
    if (player && !gameOver) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        // Target new position (center of player)
        let newPlayerX = mouseX;
        let newPlayerY = mouseY;
        
        // Calculate speed based on current player position and new mouse position
        const dx = newPlayerX - player.x;
        const dy = newPlayerY - player.y;
        const currentSpeed = Math.sqrt(dx * dx + dy * dy);

        // Before updating player.x and player.y, this is the "previous" position for the trail
        if (currentSpeed > player.minSpeedForTrail) {
            player.trail.unshift({ 
                x: player.x, // Current position becomes trail segment
                y: player.y, 
                opacity: 1.0, 
                width: player.width, // Store width/height for trail rendering
                height: player.height 
            });
        }
        
        // Update player's actual position to the new mouse position
        player.x = newPlayerX;
        player.y = newPlayerY;

        // Keep player within canvas boundaries (player.x and player.y are center)
        const halfPlayerWidth = player.width / 2;
        const halfPlayerHeight = player.height / 2;
        player.x = Math.max(halfPlayerWidth, Math.min(player.x, canvas.width - halfPlayerWidth));
        player.y = Math.max(halfPlayerHeight, Math.min(player.y, canvas.height - halfPlayerHeight));
        
    }
});

// Player Shooting Input
canvas.addEventListener('mousedown', (event) => {
    if (player && !gameOver) {
        const currentTime = Date.now();
        if (currentTime - player.lastShotTime > player.shootInterval) {
            const bulletSpeed = 12; // Increased speed for player bullets
            const bulletWidth = 8;
            const bulletHeight = 15;
            const bulletColor = '#ADD8E6'; // Lightblue

            // Spawn bullet from the top-center of the player
            // Player x,y is center. Bullet x,y is top-left.
            const bulletX = player.x - bulletWidth / 2;
            const bulletY = player.y - player.height / 2 - bulletHeight; // Spawn above player

            bullets.push(new Bullet(
                bulletX,
                bulletY,
                bulletWidth,
                bulletHeight,
                bulletColor,
                bulletSpeed,
                0, // velocityX
                -bulletSpeed, // velocityY (negative for upwards)
                'player' // type
            ));
            player.lastShotTime = currentTime;
            console.log("Player fired. Total bullets:", bullets.length);
        }
    }
});


// Restart Button Event Listener
restartButton.addEventListener('click', resetGame);


// Start the game
// Player initialization and game reset is now handled in onImageLoad -> resetGame
// gameLoop() will run, but meaningful updates/rendering start after image loading and resetGame.
updateScoreDisplay(); // Initial display
updateLivesDisplay(); // Initial display
gameLoop(); // Start the loop
// loadImages() is already called earlier.
// resetGame() will be called once images are loaded.

// --- Particle Effects ---
function createExplosion(x, y, color) {
    const particleCount = 20 + Math.floor(Math.random() * 10); // 20-29 particles
    for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 1; // Speed 1-4
        const speedX = Math.cos(angle) * speed;
        const speedY = Math.sin(angle) * speed;
        const size = Math.random() * 3 + 2; // Size 2-5
        const lifeSpan = Math.random() * 30 + 30; // Lifespan 30-60 updates
        particles.push(new Particle(x, y, color, size, speedX, speedY, lifeSpan));
    }
}
