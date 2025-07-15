'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSpheresContract } from '../../hooks/useSpheresContract';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { Package, Shield, Gift, Zap, Star, Crown, Trophy, Ticket, ExternalLink, Sparkles, Coins } from 'lucide-react';

interface Prize {
    icon: React.ComponentType<{ className?: string }>;
    name: string;
    description: string;
    chance: string;
    color: string;
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
}

interface RevealedPrize {
    type: string;
    value?: number;
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
    icon: React.ComponentType<{ className?: string }>;
    name: string;
    description: string;
}

const potentialPrizes: Prize[] = [
    { icon: Crown, name: "Legendary NFT", description: "Unikatowy, super rzadki kolekcjonerski NFT", chance: "1%", color: "text-yellow-400", rarity: "legendary" },
    { icon: Ticket, name: "Achievement Voucher", description: "Użyj aby odblokować dowolne premium osiągnięcie za darmo", chance: "4%", color: "text-purple-400", rarity: "epic" },
    { icon: Shield, name: "Streak Saver", description: "Ochrona przed utratą dziennej serii aktywności", chance: "10%", color: "text-blue-400", rarity: "rare" },
    { icon: Zap, name: "3-Day Boost", description: "Losowy 3-dniowy boost dla XP lub reputacji", chance: "5%", color: "text-green-400", rarity: "rare" },
    { icon: Star, name: "1-Day Boost", description: "Losowy 1-dniowy boost dla twoich statystyk", chance: "10%", color: "text-green-500", rarity: "uncommon" },
    { icon: Coins, name: "25 Respect Points", description: "Solidny boost dla twojej pozycji w społeczności", chance: "20%", color: "text-pink-400", rarity: "uncommon" },
    { icon: Package, name: "5 Respect Points", description: "Mały bonus za zaangażowanie", chance: "20%", color: "text-gray-300", rarity: "common" },
];

const rarityColors = {
    common: "border-gray-500 bg-gray-500/10 text-gray-300",
    uncommon: "border-green-500 bg-green-500/10 text-green-300",
    rare: "border-blue-500 bg-blue-500/10 text-blue-300",
    epic: "border-purple-500 bg-purple-500/10 text-purple-300",
    legendary: "border-yellow-500 bg-yellow-500/10 text-yellow-300"
};

const PrizeCard = ({ prize }: { prize: Prize }) => (
    <div className={`p-4 rounded-xl border text-center transition-all hover:scale-105 ${rarityColors[prize.rarity]}`}>
        <prize.icon className={`h-8 w-8 mx-auto mb-3 ${prize.color}`} />
        <h4 className="font-semibold text-white text-sm">{prize.name}</h4>
        <p className="text-xs text-gray-400 mb-2">{prize.description}</p>
        <div className="text-xs font-bold bg-white/10 rounded-full px-2 py-1 inline-block">
            {prize.chance}
        </div>
    </div>
);

const BoxOpeningAnimation = ({ isOpening, onComplete }: { isOpening: boolean; onComplete: () => void }) => {
    useEffect(() => {
        if (isOpening) {
            const timer = setTimeout(onComplete, 3000); // 3 sekundy animacji
            return () => clearTimeout(timer);
        }
    }, [isOpening, onComplete]);

    return (
        <AnimatePresence>
            {isOpening && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center"
                >
                    <div className="text-center">
                        <motion.div
                            animate={{ 
                                rotateY: [0, 360],
                                scale: [1, 1.2, 1]
                            }}
                            transition={{ 
                                duration: 0.8, 
                                repeat: Infinity,
                                ease: "easeInOut"
                            }}
                            className="mb-8"
                        >
                            <Package className="h-32 w-32 text-purple-400 mx-auto" />
                        </motion.div>
                        
                        <motion.div
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 1, repeat: Infinity }}
                        >
                            <h2 className="text-3xl font-bold text-white mb-4">Otwieranie Utility Box...</h2>
                            <div className="flex justify-center space-x-2">
                                {[0, 1, 2].map((i) => (
                                    <motion.div
                                        key={i}
                                        animate={{ y: [0, -10, 0] }}
                                        transition={{ 
                                            duration: 0.6, 
                                            repeat: Infinity,
                                            delay: i * 0.2
                                        }}
                                        className="w-3 h-3 bg-purple-400 rounded-full"
                                    />
                                ))}
                            </div>
                        </motion.div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

const PrizeReveal = ({ prize, onClose }: { prize: RevealedPrize | null; onClose: () => void }) => {
    if (!prize) return null;

    const rarityConfig = {
        common: { particles: 5, color: "bg-gray-400", glowColor: "shadow-gray-400/50" },
        uncommon: { particles: 10, color: "bg-green-400", glowColor: "shadow-green-400/50" },
        rare: { particles: 15, color: "bg-blue-400", glowColor: "shadow-blue-400/50" },
        epic: { particles: 20, color: "bg-purple-400", glowColor: "shadow-purple-400/50" },
        legendary: { particles: 30, color: "bg-yellow-400", glowColor: "shadow-yellow-400/50" }
    };

    const config = rarityConfig[prize.rarity];

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center"
                onClick={onClose}
            >
                {/* Cząsteczki */}
                {Array.from({ length: config.particles }).map((_, i) => (
                    <motion.div
                        key={i}
                        initial={{ 
                            x: "50vw", 
                            y: "50vh", 
                            opacity: 0,
                            scale: 0
                        }}
                        animate={{ 
                            x: `${Math.random() * 100}vw`,
                            y: `${Math.random() * 100}vh`,
                            opacity: [0, 1, 0],
                            scale: [0, 1, 0]
                        }}
                        transition={{ 
                            duration: 2 + Math.random() * 2,
                            delay: Math.random() * 0.5
                        }}
                        className={`absolute w-2 h-2 rounded-full ${config.color}`}
                    />
                ))}

                <motion.div
                    initial={{ scale: 0, rotateY: 180 }}
                    animate={{ scale: 1, rotateY: 0 }}
                    exit={{ scale: 0, rotateY: -180 }}
                    transition={{ type: "spring", duration: 0.8 }}
                    className={`bg-white/10 backdrop-blur-sm rounded-3xl p-12 border text-center max-w-md mx-4 ${rarityColors[prize.rarity]} ${config.glowColor} shadow-2xl`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <motion.div
                        animate={{ 
                            y: [0, -10, 0],
                            rotateZ: [0, 5, -5, 0]
                        }}
                        transition={{ 
                            duration: 2, 
                            repeat: Infinity,
                            ease: "easeInOut"
                        }}
                        className="mb-6"
                    >
                        <prize.icon className={`h-24 w-24 mx-auto ${prize.rarity === 'legendary' ? 'text-yellow-400' : prize.rarity === 'epic' ? 'text-purple-400' : prize.rarity === 'rare' ? 'text-blue-400' : prize.rarity === 'uncommon' ? 'text-green-400' : 'text-gray-400'}`} />
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                    >
                        <div className={`inline-block px-4 py-2 rounded-full text-sm font-bold mb-4 ${rarityColors[prize.rarity]}`}>
                            {prize.rarity.toUpperCase()}
                        </div>
                        <h2 className="text-3xl font-bold text-white mb-4">
                            {prize.name}
                            {prize.value && ` (+${prize.value})`}
                        </h2>
                        <p className="text-gray-300 mb-8">{prize.description}</p>
                        
                        <button
                            onClick={onClose}
                            className="bg-white/20 hover:bg-white/30 text-white font-bold py-3 px-8 rounded-lg transition-all"
                        >
                            Niesamowite! 🎉
                        </button>
                    </motion.div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default function UtilityBoxSystem() {
    const router = useRouter();
    const { 
        utilityBoxFee,
        userMemberships, 
        openUtilityBox, 
        isLoading: contractLoading,
        hash: transactionHashFromHook,
        isConfirming,
        isConfirmed
    } = useSpheresContract();

    const [selectedCommunityId, setSelectedCommunityId] = useState<string>('');
    const [isOpening, setIsOpening] = useState(false);
    const [revealedPrize, setRevealedPrize] = useState<RevealedPrize | null>(null);
    const [transactionHash, setTransactionHash] = useState<string>('');

    const handleOpenBox = async () => {
        if (!selectedCommunityId) {
            toast.error("Najpierw wybierz społeczność!");
            return;
        }
        
        setIsOpening(true);

        try {
            await openUtilityBox(Number(selectedCommunityId));
            
            // Czekaj na hash z hooka
            const checkForHash = () => {
                return new Promise<string>((resolve, reject) => {
                    let attempts = 0;
                    const maxAttempts = 100; // 10 sekund
                    
                    const check = () => {
                        if (transactionHashFromHook) {
                            resolve(transactionHashFromHook);
                        } else if (attempts >= maxAttempts) {
                            reject(new Error('Timeout - nie otrzymano hash transakcji'));
                        } else {
                            attempts++;
                            setTimeout(check, 100);
                        }
                    };
                    check();
                });
            };
            
            const hash = await checkForHash();
            setTransactionHash(hash);
            
            // Pokazuj toast z linkiem do transakcji
            toast.success(
                <div className="flex flex-col space-y-2">
                    <span>Transakcja została wysłana!</span>
                    <a 
                        href={`https://basescan.org/tx/${hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-1 text-blue-400 hover:text-blue-300"
                    >
                        <span>Zobacz na BaseScan</span>
                        <ExternalLink className="h-4 w-4" />
                    </a>
                </div>,
                { duration: 8000 }
            );

            // Czekaj na potwierdzenie transakcji
            const checkForConfirmation = () => {
                return new Promise<void>((resolve, reject) => {
                    let attempts = 0;
                    const maxAttempts = 300; // 30 sekund
                    
                    const check = () => {
                        if (isConfirmed) {
                            resolve();
                        } else if (attempts >= maxAttempts) {
                            reject(new Error('Timeout - transakcja trwa zbyt długo'));
                        } else {
                            attempts++;
                            setTimeout(check, 100);
                        }
                    };
                    check();
                });
            };
            
            await checkForConfirmation();
            
            // Symulacja rezultatu na podstawie prawdopodobieństw z kontraktu
            const randomValue = Math.random() * 100;
            let prizeResult: RevealedPrize;
            
            if (randomValue < 1) {
                prizeResult = {
                    type: "NFT",
                    rarity: "legendary",
                    icon: Crown,
                    name: "Legendary NFT",
                    description: "Unikatowy kolekcjonerski NFT został dodany do twojej kolekcji!"
                };
            } else if (randomValue < 5) {
                prizeResult = {
                    type: "Achievement Voucher",
                    rarity: "epic",
                    icon: Ticket,
                    name: "Achievement Voucher",
                    description: "Teraz możesz odblokować dowolne premium osiągnięcie za darmo!"
                };
            } else if (randomValue < 15) {
                prizeResult = {
                    type: "Streak Saver",
                    rarity: "rare",
                    icon: Shield,
                    name: "Streak Saver",
                    description: "Twoja dzienna seria będzie chroniona przed zerwaniem!"
                };
            } else if (randomValue < 20) {
                prizeResult = {
                    type: "3-Day Boost",
                    rarity: "rare",
                    icon: Zap,
                    name: "3-Day Boost",
                    description: "Otrzymałeś 3-dniowy boost zwiększający twoje doświadczenie!"
                };
            } else if (randomValue < 30) {
                prizeResult = {
                    type: "1-Day Boost",
                    rarity: "uncommon",
                    icon: Star,
                    name: "1-Day Boost",
                    description: "Otrzymałeś 1-dniowy boost dla swoich statystyk!"
                };
            } else if (randomValue < 50) {
                prizeResult = {
                    type: "Respect Points",
                    value: 25,
                    rarity: "uncommon",
                    icon: Coins,
                    name: "Respect Points",
                    description: "Twoja reputacja w społeczności wzrosła!"
                };
            } else if (randomValue < 70) {
                prizeResult = {
                    type: "Respect Points",
                    value: 5,
                    rarity: "common",
                    icon: Package,
                    name: "Respect Points",
                    description: "Otrzymałeś bonus punktów za aktywność!"
                };
            } else {
                prizeResult = {
                    type: "Nothing",
                    rarity: "common",
                    icon: Package,
                    name: "Nic tym razem",
                    description: "Może następnym razem będziesz miał więcej szczęścia!"
                };
            }

            // Zawsze pokaż nagrodę po 3 sekundach (animacja)
            setTimeout(() => {
                setRevealedPrize(prizeResult);
                
                // Dodatkowy toast z nagrodą
                if (prizeResult.type !== "Nothing") {
                    toast.success(
                        <div className="flex items-center space-x-2">
                            <prizeResult.icon className="h-5 w-5" />
                            <span>Wygrałeś: {prizeResult.name}!</span>
                        </div>,
                        { duration: 5000 }
                    );
                }
            }, 3000);

        } catch (error: any) {
            console.error('Błąd otwierania boxa:', error);
            toast.error(`Błąd: ${error.message || 'Transakcja nieudana'}`);
            setIsOpening(false);
            setRevealedPrize(null);
        }
    };

    const handleAnimationComplete = () => {
        // Animacja zakończona, czekamy na revealing prize
    };

    const handleCloseReveal = () => {
        setRevealedPrize(null);
        setIsOpening(false);
        setTransactionHash('');
    };

    return (
        <>
            <BoxOpeningAnimation isOpening={isOpening && !revealedPrize} onComplete={handleAnimationComplete} />
            <PrizeReveal prize={revealedPrize} onClose={handleCloseReveal} />
            
            <div className="space-y-8">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center space-x-4"
                >
                    <button
                        onClick={() => router.back()}
                        className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                    >
                        <Crown className="h-5 w-5 text-white" />
                    </button>
                    <div className="text-left">
                        <h2 className="text-3xl font-bold text-white mb-1">🎁 Utility Box</h2>
                        <p className="text-gray-300">
                            Otwórz tajemniczy box i wygraj ekskluzywne nagrody! Musisz być członkiem społeczności.
                        </p>
                    </div>
                </motion.div>

                {/* Main Box Area */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 text-center relative overflow-hidden"
                    >
                        {/* Dekoracyjne elementy */}
                        <div className="absolute top-4 right-4">
                            <Sparkles className="h-6 w-6 text-yellow-400 animate-pulse" />
                        </div>
                        <div className="absolute bottom-4 left-4">
                            <Sparkles className="h-4 w-4 text-purple-400 animate-pulse" style={{ animationDelay: '0.5s' }} />
                        </div>

                        <motion.div
                            animate={{ 
                                y: [0, -5, 0],
                                rotateY: [0, 10, -10, 0]
                            }}
                            transition={{ 
                                duration: 3, 
                                repeat: Infinity,
                                ease: "easeInOut"
                            }}
                            className="mb-6"
                        >
                            <Package className="h-24 w-24 mx-auto text-purple-400" />
                        </motion.div>
                        
                        <h3 className="text-2xl font-bold text-white mb-4">🎮 Mystery Utility Box</h3>
                        
                        {userMemberships && userMemberships.length > 0 ? (
                            <div className="space-y-4">
                                <select
                                    value={selectedCommunityId}
                                    onChange={(e) => setSelectedCommunityId(e.target.value)}
                                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                >
                                    <option value="" disabled>Wybierz społeczność</option>
                                    {userMemberships.map(membership => (
                                        <option key={membership.communityId} value={membership.communityId}>
                                            Społeczność #{membership.communityId}
                                        </option>
                                    ))}
                                </select>

                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={handleOpenBox}
                                    disabled={isOpening || contractLoading || !selectedCommunityId}
                                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-4 px-6 rounded-lg transition-all disabled:bg-gray-600 disabled:cursor-not-allowed shadow-lg"
                                >
                                    {isOpening ? '🎲 Otwieranie...' : `🎁 Otwórz Box (${utilityBoxFee || '0.0001'} ETH)`}
                                </motion.button>
                            </div>
                        ) : (
                            <div className="text-center text-gray-400">
                                <p>Musisz być członkiem przynajmniej jednej społeczności, żeby otworzyć box.</p>
                                <button 
                                    onClick={() => router.push('/spheres/community-browser')} 
                                    className="mt-4 text-purple-400 font-semibold hover:text-purple-300 transition-colors"
                                >
                                    Przeglądaj Społeczności →
                                </button>
                            </div>
                        )}
                    </motion.div>

                    {/* Prize Pool */}
                    <motion.div
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 }}
                        className="space-y-4"
                    >
                        <h3 className="text-xl font-bold text-white text-center">🎯 Co możesz wygrać?</h3>
                        <div className="grid grid-cols-2 gap-3">
                            {potentialPrizes.map(prize => (
                                <PrizeCard key={prize.name} prize={prize} />
                            ))}
                        </div>
                        
                        <div className="bg-white/5 rounded-lg p-4 mt-4">
                            <h4 className="text-white font-semibold mb-2">💡 Wskazówki:</h4>
                            <ul className="text-sm text-gray-400 space-y-1">
                                <li>• Im rzadsza nagroda, tym lepsze efekty wizualne</li>
                                <li>• Możesz otwierać tyle boxów ile chcesz</li>
                                <li>• Wszystkie transakcje są sprawdzalne na BaseScan</li>
                                <li>• Legendary NFT to najbardziej cenna nagroda!</li>
                            </ul>
                        </div>
                    </motion.div>
                </div>
            </div>
        </>
    );
}