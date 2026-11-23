import { Observable } from 'rxjs';
import { take } from 'rxjs/operators';

/** rxjs 6 (the dashboard's version) has no `firstValueFrom`. */
export function firstValueFrom<T>(source: Observable<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    source.pipe(take(1)).subscribe({
      next: resolve,
      error: reject,
      complete: () => reject(new Error('firstValueFrom: the observable completed without emitting')),
    });
  });
}
