package solution

import "time"

func InHCM(t time.Time) (time.Time, error) {
	loc, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	if err != nil {
		return time.Time{}, err
	}
	return t.In(loc), nil
}
