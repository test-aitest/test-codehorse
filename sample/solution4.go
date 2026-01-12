package main

type Solution4 struct{}

func (s *Solution4) TwoSum4(nums []int, target int) []int {
	seen := make(map[int]int)
	for i, num := range nums {
		if j, ok := seen[target-num]; ok {
			return []int{j, i}
		}
		seen[num] = i
	}
	return []int{}
}
