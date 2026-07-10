from env import TrickTakingEnv
from heuristics import get_heuristic_action

env = TrickTakingEnv('oh_hell.yaml', reward_mode='pure')
print('num_players:', env.num_players)
print('deal_sequence:', env.deal_sequence)
print('scoring_type:', env.scoring_type)
print('bidding_required:', env.bidding_required)

obs = env.reset(cards_per_player=3, round_idx=0, starting_player=0)
print('initial phase:', env.phase)
steps = 0
while env.phase != 'completed' and steps < 200:
    action = get_heuristic_action(obs)
    obs, reward, done, _ = env.step(action)
    steps += 1
    if steps % 20 == 0:
        print(f'step {steps}, phase={env.phase}, player_id={obs.get("player_id")}, legal_moves_count={len(obs.get("legal_moves",[]))}')

print(f'Finished in {steps} steps, phase={env.phase}')
print('bids:', env.bids)
print('tricks_won:', env.tricks_won)
print('scores:', env.scores)
