import React, { useState } from "react";
import { AuctionView } from "../../views/AuctionView";
import { applyTutorialAuctionBid, createTutorialAuctionGame } from "../tutorialMock";

export const DemoAuction: React.FC = () => {
  const [game, setGame] = useState(() => createTutorialAuctionGame());
  const me = game.players[0];

  return (
    <div className="tutorial-auction-demo">
      <AuctionView
        game={game}
        me={me}
        layout="embedded"
        onPlaceBid={(amount) => {
          setGame((g) => applyTutorialAuctionBid(g, g.players[0], amount));
        }}
        onUseForceBuy={() => {
          window.alert("教程试玩：强买强卖请在正式拍卖阶段对当前焦点卡使用。");
        }}
      />
    </div>
  );
};
