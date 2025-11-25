import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Trophy, RefreshCw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

interface SnakeGameModalProps {
  onClose: () => void;
}

const GRID_SIZE = 20;
const CELL_SIZE = 20; // Visual size in pixels logic handled by CSS grid
const INITIAL_SPEED = 150;

type Point = { x: number; y: number };

export const SnakeGameModal: React.FC<SnakeGameModalProps> = ({ onClose }) => {
  const [snake, setSnake] = useState<Point[]>([{ x: 10, y: 10 }]);
  const [food, setFood] = useState<Point>({ x: 15, y: 15 });
  const [direction, setDirection] = useState<Point>({ x: 0, y: 0 }); // Start stationary
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const directionRef = useRef<Point>({ x: 0, y: 0 }); // Ref to prevent multiple turns per tick

  // Load High Score
  useEffect(() => {
    const saved = localStorage.getItem('lumini_snake_highscore');
    if (saved) setHighScore(parseInt(saved));
  }, []);

  const generateFood = useCallback((): Point => {
    return {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE)
    };
  }, []);

  const resetGame = () => {
    setSnake([{ x: 10, y: 10 }]);
    setFood(generateFood());
    setDirection({ x: 0, y: 0 });
    directionRef.current = { x: 0, y: 0 };
    setGameOver(false);
    setScore(0);
    setGameStarted(false);
    if (gameLoopRef.current) clearInterval(gameLoopRef.current);
  };

  const checkCollision = (head: Point) => {
    // Wall collision
    if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) return true;
    // Self collision (ignore tail as it will move)
    for (let i = 0; i < snake.length - 1; i++) {
      if (head.x === snake[i].x && head.y === snake[i].y) return true;
    }
    return false;
  };

  const moveSnake = useCallback(() => {
    if (gameOver || !gameStarted) return;

    setSnake(prevSnake => {
      const head = prevSnake[0];
      const newHead = {
        x: head.x + directionRef.current.x,
        y: head.y + directionRef.current.y
      };

      if (checkCollision(newHead)) {
        setGameOver(true);
        if (score > highScore) {
          setHighScore(score);
          localStorage.setItem('lumini_snake_highscore', score.toString());
        }
        return prevSnake;
      }

      const newSnake = [newHead, ...prevSnake];

      // Check Food
      if (newHead.x === food.x && newHead.y === food.y) {
        setScore(s => s + 1);
        setFood(generateFood());
        // Don't pop tail (grow)
      } else {
        newSnake.pop(); // Remove tail
      }

      return newSnake;
    });
  }, [food, gameOver, gameStarted, highScore, score, generateFood]);

  useEffect(() => {
    if (gameStarted && !gameOver) {
      gameLoopRef.current = setInterval(moveSnake, INITIAL_SPEED);
    }
    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    };
  }, [gameStarted, gameOver, moveSnake]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (gameOver) return;
    
    // Prevent scrolling with arrows
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
    }

    if (!gameStarted && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        setGameStarted(true);
    }

    const currentDir = directionRef.current;

    switch (e.key) {
      case 'ArrowUp':
        if (currentDir.y !== 1) directionRef.current = { x: 0, y: -1 };
        break;
      case 'ArrowDown':
        if (currentDir.y !== -1) directionRef.current = { x: 0, y: 1 };
        break;
      case 'ArrowLeft':
        if (currentDir.x !== 1) directionRef.current = { x: -1, y: 0 };
        break;
      case 'ArrowRight':
        if (currentDir.x !== -1) directionRef.current = { x: 1, y: 0 };
        break;
    }
    setDirection(directionRef.current); // Force re-render for UI updates if needed
  }, [gameOver, gameStarted]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleMobileControl = (dir: string) => {
      if (!gameStarted) setGameStarted(true);
      if (gameOver) return;

      const currentDir = directionRef.current;
      switch (dir) {
          case 'up': if (currentDir.y !== 1) directionRef.current = { x: 0, y: -1 }; break;
          case 'down': if (currentDir.y !== -1) directionRef.current = { x: 0, y: 1 }; break;
          case 'left': if (currentDir.x !== 1) directionRef.current = { x: -1, y: 0 }; break;
          case 'right': if (currentDir.x !== -1) directionRef.current = { x: 1, y: 0 }; break;
      }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md shadow-2xl relative overflow-hidden flex flex-col items-center">
        
        {/* Header */}
        <div className="w-full p-4 flex justify-between items-center bg-slate-800/50 border-b border-slate-700">
          <div className="flex items-center gap-2 text-violet-400">
             <Trophy size={20} />
             <span className="font-bold">Счет: {score}</span>
             <span className="text-slate-500 text-sm ml-2">Рекорд: {highScore}</span>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Game Area */}
        <div className="p-4">
            <div 
                className="relative bg-slate-950 border-2 border-slate-700 rounded-lg shadow-inner"
                style={{ 
                    width: '300px', 
                    height: '300px',
                    display: 'grid',
                    gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
                    gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`
                }}
            >
                {/* Overlay Messages */}
                {!gameStarted && !gameOver && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10 rounded-lg">
                        <p className="text-white text-sm animate-pulse">Нажми стрелку для старта</p>
                    </div>
                )}
                {gameOver && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-10 rounded-lg">
                        <p className="text-red-500 font-bold text-xl mb-2">GAME OVER</p>
                        <button 
                            onClick={resetGame}
                            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-full hover:bg-violet-500 transition-colors"
                        >
                            <RefreshCw size={16} /> Еще раз
                        </button>
                    </div>
                )}

                {/* Rendering Grid */}
                {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
                    const x = i % GRID_SIZE;
                    const y = Math.floor(i / GRID_SIZE);
                    const isSnakeHead = snake[0].x === x && snake[0].y === y;
                    const isSnakeBody = snake.some((p, idx) => idx > 0 && p.x === x && p.y === y);
                    const isFood = food.x === x && food.y === y;

                    let className = 'w-full h-full ';
                    if (isSnakeHead) className += 'bg-violet-500 rounded-sm z-10';
                    else if (isSnakeBody) className += 'bg-violet-500/50 rounded-sm';
                    else if (isFood) className += 'bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]';
                    
                    return <div key={i} className={className}></div>
                })}
            </div>
        </div>

        {/* Controls for Mobile */}
        <div className="pb-6 pt-2 grid grid-cols-3 gap-2 w-48">
            <div></div>
            <button 
                className="w-14 h-14 bg-slate-800 rounded-full flex items-center justify-center text-white active:bg-violet-600 transition-colors shadow-lg border border-slate-700"
                onClick={() => handleMobileControl('up')}
            >
                <ChevronUp size={24} />
            </button>
            <div></div>
            
            <button 
                className="w-14 h-14 bg-slate-800 rounded-full flex items-center justify-center text-white active:bg-violet-600 transition-colors shadow-lg border border-slate-700"
                onClick={() => handleMobileControl('left')}
            >
                <ChevronLeft size={24} />
            </button>
            <button 
                className="w-14 h-14 bg-slate-800 rounded-full flex items-center justify-center text-white active:bg-violet-600 transition-colors shadow-lg border border-slate-700"
                onClick={() => handleMobileControl('down')}
            >
                <ChevronDown size={24} />
            </button>
            <button 
                className="w-14 h-14 bg-slate-800 rounded-full flex items-center justify-center text-white active:bg-violet-600 transition-colors shadow-lg border border-slate-700"
                onClick={() => handleMobileControl('right')}
            >
                <ChevronRight size={24} />
            </button>
        </div>

      </div>
    </div>
  );
};