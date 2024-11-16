import {takeUntil, timer} from 'rxjs';
import {switchMap, filter, take} from 'rxjs/operators';

/**
 * Custom operator that waits until a condition is true before emitting.
 * If `maxTime` is defined, the observable will complete with an error if the condition is not met within the specified time.
 * @param {() => boolean} condition - The condition function to check.
 * @param {number} pollingInterval - The interval in milliseconds to poll the condition.
 * @param {number} [maxTime] - Optional maximum time in milliseconds to wait before completing with an error if the condition is not met.
 * @returns {Observable} An observable that emits when the condition is true or completes if maxTime is reached.
 */

const pollUntilCondition = (condition, pollingInterval = 1000, maxTime) =>
    (source$) => source$.pipe(
        switchMap((value) =>
            timer(0, pollingInterval).pipe(
                filter(() => condition()),
                take(1), // Emit only once when the condition is met
                switchMap(() => [value]), // Emit the original source value
                ...(maxTime !== undefined ? [takeUntil(timer(maxTime))] : []) // Apply ceiling only if maxTime is defined
            )
        )
    );


export {pollUntilCondition};