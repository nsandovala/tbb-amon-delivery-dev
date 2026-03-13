"use client";

import { useState } from "react";
import { MessageSquare, X, Play, Clock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function HeoChatbot() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end pointer-events-none">
      {/* Panel */}
      <div 
        className={cn(
          "mb-4 w-[320px] bg-card border border-white/10 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 origin-bottom-right pointer-events-auto",
          isOpen ? "scale-100 opacity-100" : "scale-75 opacity-0 invisible"
        )}
      >
        <div className="bg-gradient-to-r from-accent/20 to-transparent p-4 flex justify-between items-center border-b border-white/5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="font-bold text-white tracking-wide">HEO Sentinela</span>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="text-white/60 hover:text-white transition-colors p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="p-4 flex flex-col gap-3">
          <p className="text-sm text-neutral-300 font-medium">
            ¿En qué te puedo ayudar hoy?
          </p>
          
          <div className="flex flex-col gap-2">
            <button className="flex items-center gap-3 bg-white/5 hover:bg-white/10 p-3 rounded-xl transition-colors border border-transparent hover:border-white/10 text-left">
              <div className="bg-accent/10 p-2 rounded-full text-accent">
                <Play className="w-3.5 h-3.5 fill-accent ml-0.5" />
              </div>
              <span className="text-xs text-white font-medium">Quiero repetir mi último pedido</span>
            </button>
            <button className="flex items-center gap-3 bg-white/5 hover:bg-white/10 p-3 rounded-xl transition-colors border border-transparent hover:border-white/10 text-left">
              <div className="bg-blue-500/10 p-2 rounded-full text-blue-400">
                <Clock className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs text-white font-medium">¿Cuánto tarda en llegar?</span>
            </button>
          </div>
        </div>
        
        <div className="p-3 bg-white/5 border-t border-white/5 text-center">
          <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">
            Potenciado por AMON AI
          </p>
        </div>
      </div>

      {/* Bubble */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center justify-center gap-2 px-5 py-3 rounded-full font-bold shadow-lg transition-all duration-300 pointer-events-auto",
          isOpen 
            ? "bg-white/10 text-white hover:bg-white/20" 
            : "bg-accent hover:bg-accent-hover text-background shadow-[0_0_15px_rgba(0,255,156,0.3)] hover:shadow-[0_0_25px_rgba(0,255,156,0.5)]"
        )}
      >
        {isOpen ? <X className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
        {!isOpen && <span>HEO</span>}
      </button>
    </div>
  );
}
