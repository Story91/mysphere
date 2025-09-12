import { NextResponse } from "next/server";
import { prepareAgentkitAndWalletProvider } from "../agent/prepare-agentkit";

export async function GET() {
  try {
    const { agentkit, walletProvider } = await prepareAgentkitAndWalletProvider();
    
    // Get all available actions
    const availableActions = agentkit.getActions();
    const network = walletProvider.getNetwork();
    
    // Check if swap action exists (with or without provider prefix)
    const swapAction = availableActions.find(action => 
      action.name === "swap" || action.name.includes("swap")
    );
    
    // Return debug info
    return NextResponse.json({
      network: {
        networkId: network.networkId,
        protocolFamily: network.protocolFamily,
        chainId: network.chainId
      },
      totalActions: availableActions.length,
      actions: availableActions.map(action => ({
        name: action.name,
        description: action.description.substring(0, 100) + "..."
      })),
      swapActionAvailable: !!swapAction,
      swapActionDetails: swapAction ? {
        name: swapAction.name,
        description: swapAction.description.substring(0, 200),
        hasSchema: !!swapAction.schema
      } : null,
      walletAddress: walletProvider.getAddress()
    });
    
  } catch (error) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
